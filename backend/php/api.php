<?php
/**
 * Re:Likes PHP backend.
 *
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

final class RelikesApiError extends RuntimeException
{
    public int $status;
    public string $errorCode;
    public array $details;

    public function __construct(
        int $status,
        string $errorCode,
        string $message,
        array $details = []
    ) {
        parent::__construct($message);
        $this->status = $status;
        $this->errorCode = $errorCode;
        $this->details = $details;
    }
}

$config = require __DIR__ . '/config.php';

try {
    initialize_storage($config);
    apply_request_headers($config);
    route_request($config);
} catch (RelikesApiError $error) {
    respond_json($error->status, [
        'error' => [
            'code' => $error->errorCode,
            'message' => $error->getMessage(),
            'details' => $error->details,
        ],
    ]);
} catch (Throwable $error) {
    error_log('Relikes backend error: ' . $error->getMessage());
    respond_json(500, [
        'error' => [
            'code' => 'internal_error',
            'message' => 'The backend could not complete the request.',
        ],
    ]);
}

function route_request(array $config): void
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    $action = isset($_GET['action']) ? (string) $_GET['action'] : 'health';

    if ($action === 'health' && $method === 'GET') {
        handle_health($config);
    }

    if ($action === 'session' && $method === 'POST') {
        handle_session($config);
    }

    if ($action === 'reactions' && in_array($method, ['POST', 'PUT'], true)) {
        handle_reaction_snapshot($config);
    }

    if ($action === 'heatmap' && $method === 'GET') {
        handle_heatmap($config);
    }

    throw new RelikesApiError(404, 'route_not_found', 'Unknown backend route.');
}

function handle_health(array $config): void
{
    $documents = load_documents($config);
    load_secret($config);

    respond_json(200, [
        'ok' => true,
        'service' => 'relikes-json-backend',
        'schema' => 1,
        'time' => gmdate(DATE_ATOM),
        'documents' => array_keys($documents),
    ]);
}

function handle_session(array $config): void
{
    enforce_rate_limit(
        $config,
        'session-ip',
        request_ip(),
        $config['rate_limits']['session_per_ip']
    );

    $now = time();
    $payload = [
        'v' => 1,
        'sid' => bin2hex(random_bytes(16)),
        'iat' => $now,
        'exp' => $now + (int) $config['anonymous_token_ttl'],
    ];
    $token = sign_token($payload, load_secret($config));

    respond_json(201, [
        'schema' => 1,
        'subjectType' => 'anonymous',
        'token' => $token,
        'expiresAt' => gmdate(DATE_ATOM, $payload['exp']),
    ]);
}

function handle_reaction_snapshot(array $config): void
{
    require_json_content_type();
    $subject = authenticate_anonymous_subject($config);
    enforce_rate_limit(
        $config,
        'write-ip',
        request_ip(),
        $config['rate_limits']['write_per_ip']
    );
    enforce_rate_limit(
        $config,
        'write-subject',
        $subject['id'],
        $config['rate_limits']['write_per_subject']
    );

    $payload = read_json_body((int) $config['max_body_bytes']);
    $snapshot = validate_snapshot($payload, $config);
    $documentDirectory = document_directory(
        $config,
        $snapshot['documentId'],
        $snapshot['documentVersion']
    );

    $result = with_document_lock($documentDirectory, LOCK_EX, function () use (
        $config,
        $documentDirectory,
        $snapshot,
        $subject
    ): array {
        $statePath = $documentDirectory . '/state.json';
        $state = read_json_file($statePath, [
            'schema' => 1,
            'revision' => 0,
            'dirty' => true,
        ]);
        $subjectDirectory = $documentDirectory . '/subjects';
        ensure_directory($subjectDirectory);
        $subjectPath = $subjectDirectory . '/' . hash('sha256', $subject['id']) . '.json';
        $existing = read_json_file($subjectPath, null);

        if (is_array($existing)) {
            if (($existing['mutationId'] ?? null) === $snapshot['mutationId']) {
                return [
                    'serverRevision' => (int) ($existing['serverRevision'] ?? $state['revision']),
                    'clientRevision' => (int) $existing['clientRevision'],
                    'idempotent' => true,
                ];
            }

            $existingRevision = (int) ($existing['clientRevision'] ?? -1);
            if ($snapshot['clientRevision'] <= $existingRevision) {
                throw new RelikesApiError(
                    409,
                    'stale_client_revision',
                    'The client revision is not newer than the stored snapshot.',
                    ['storedClientRevision' => $existingRevision]
                );
            }
        }

        $serverRevision = (int) ($state['revision'] ?? 0) + 1;
        $storedSnapshot = [
            ...$snapshot,
            'subjectType' => $subject['type'],
            'serverRevision' => $serverRevision,
            'updatedAt' => time(),
        ];

        atomic_write_json($statePath, [
            'schema' => 1,
            'revision' => $serverRevision,
            'dirty' => true,
            'updatedAt' => time(),
        ]);
        atomic_write_json($subjectPath, $storedSnapshot);

        return [
            'serverRevision' => $serverRevision,
            'clientRevision' => $snapshot['clientRevision'],
            'idempotent' => false,
        ];
    });

    respond_json(200, [
        'ok' => true,
        'schema' => 1,
        'documentId' => $snapshot['documentId'],
        'documentVersion' => $snapshot['documentVersion'],
        ...$result,
    ]);
}

function handle_heatmap(array $config): void
{
    enforce_rate_limit(
        $config,
        'heatmap-ip',
        request_ip(),
        $config['rate_limits']['heatmap_per_ip']
    );

    $documentId = validate_identifier($_GET['documentId'] ?? null, 'documentId');
    $documentVersion = validate_identifier($_GET['documentVersion'] ?? null, 'documentVersion');
    $excludeSubject =
        (string) ($_GET['excludeCurrentUser'] ?? '') === '1' ||
        (string) ($_GET['excludeSubject'] ?? '') === '1';
    // A reader without a session has no stored subject to exclude yet. Treat
    // that request as the public heatmap, while still rejecting a supplied
    // token when it is malformed, invalid, or expired.
    $subject = $excludeSubject && bearer_token() !== null
        ? authenticate_anonymous_subject($config)
        : null;
    get_document_spec($config, $documentId, $documentVersion);
    $documentDirectory = document_directory($config, $documentId, $documentVersion);

    $heatmap = with_document_lock($documentDirectory, LOCK_EX, function () use (
        $config,
        $documentDirectory,
        $documentId,
        $documentVersion,
        $subject
    ): array {
        $statePath = $documentDirectory . '/state.json';
        $state = read_json_file($statePath, [
            'schema' => 1,
            'revision' => 0,
            'dirty' => true,
        ]);
        $cachePath = $documentDirectory . '/heatmap.json';
        $cached = read_json_file($cachePath, null);

        if (
            empty($state['dirty']) &&
            is_array($cached) &&
            (int) ($cached['revision'] ?? -1) === (int) ($state['revision'] ?? 0) &&
            strtotime((string) ($cached['generatedAt'] ?? '')) >=
                time() - (int) $config['heatmap_cache_ttl']
        ) {
            if ($subject !== null) {
                $subjectPath = $documentDirectory . '/subjects/' . hash('sha256', $subject['id']) . '.json';
                $snapshot = read_json_file($subjectPath, null);
                return exclude_subject_snapshot_from_heatmap($cached, $snapshot);
            }

            return $cached;
        }

        $heatmap = rebuild_heatmap(
            $config,
            $documentDirectory,
            $documentId,
            $documentVersion,
            (int) ($state['revision'] ?? 0)
        );
        atomic_write_json($cachePath, $heatmap);
        atomic_write_json($statePath, [
            ...$state,
            'schema' => 1,
            'revision' => (int) ($state['revision'] ?? 0),
            'dirty' => false,
            'heatmapUpdatedAt' => time(),
        ]);

        if ($subject !== null) {
            $subjectPath = $documentDirectory . '/subjects/' . hash('sha256', $subject['id']) . '.json';
            $snapshot = read_json_file($subjectPath, null);
            return exclude_subject_snapshot_from_heatmap($heatmap, $snapshot);
        }

        return $heatmap;
    });

    $etagSource = $heatmap;
    unset($etagSource['generatedAt']);
    $etag = '"relikes-' . hash('sha256', json_encode($etagSource)) . '"';
    header('ETag: ' . $etag);
    header($subject === null
        ? 'Cache-Control: public, max-age=15, stale-while-revalidate=45'
        : 'Cache-Control: private, no-store');
    if ($subject !== null) {
        header('Vary: Authorization', false);
    }

    if ($subject === null && trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
        http_response_code(304);
        exit;
    }

    respond_json(200, $heatmap);
}

function validate_snapshot(array $payload, array $config): array
{
    if (($payload['schema'] ?? null) !== 1) {
        throw new RelikesApiError(422, 'invalid_schema', 'Only reaction schema 1 is supported.');
    }

    $documentId = validate_identifier($payload['documentId'] ?? null, 'documentId');
    $documentVersion = validate_identifier(
        $payload['documentVersion'] ?? null,
        'documentVersion'
    );
    $document = get_document_spec($config, $documentId, $documentVersion);
    $clientRevision = validate_integer($payload['clientRevision'] ?? null, 'clientRevision', 0, PHP_INT_MAX);
    $mutationId = validate_identifier($payload['mutationId'] ?? null, 'mutationId', 8);
    $reactions = $payload['reactions'] ?? null;

    if (!is_array($reactions) || count($reactions) > (int) $config['max_reactions']) {
        throw new RelikesApiError(422, 'invalid_reactions', 'The reactions array is missing or too large.');
    }

    $runsByKind = ['like' => [], 'dislike' => []];
    $runCount = 0;

    foreach ($reactions as $reaction) {
        if (!is_array($reaction) || !in_array($reaction['kind'] ?? null, ['like', 'dislike'], true)) {
            throw new RelikesApiError(422, 'invalid_reaction_kind', 'Each reaction must be like or dislike.');
        }

        if (!isset($reaction['runs']) || !is_array($reaction['runs'])) {
            throw new RelikesApiError(422, 'invalid_runs', 'Each reaction must contain a runs array.');
        }

        foreach ($reaction['runs'] as $run) {
            $runCount += 1;
            if ($runCount > (int) $config['max_runs']) {
                throw new RelikesApiError(422, 'too_many_runs', 'The snapshot contains too many ranges.');
            }

            if (!is_array($run)) {
                throw new RelikesApiError(422, 'invalid_run', 'Every run must be an object.');
            }

            $start = validate_integer($run['start'] ?? null, 'run.start', 0, $document['contentLength']);
            $end = validate_integer($run['end'] ?? null, 'run.end', 0, $document['contentLength']);
            if ($end <= $start) {
                throw new RelikesApiError(422, 'invalid_run_order', 'Run end must be greater than run start.');
            }

            $runsByKind[$reaction['kind']][] = ['start' => $start, 'end' => $end];
        }
    }

    $normalizedByKind = [];
    foreach ($runsByKind as $kind => $runs) {
        $normalizedByKind[$kind] = normalize_intervals($runs);
    }

    if (interval_sets_overlap($normalizedByKind['like'], $normalizedByKind['dislike'])) {
        throw new RelikesApiError(
            422,
            'conflicting_reactions',
            'A subject cannot like and dislike the same text range.'
        );
    }

    $normalizedReactions = [];
    foreach ($normalizedByKind as $kind => $normalizedRuns) {
        if ($normalizedRuns) {
            $normalizedReactions[] = ['kind' => $kind, 'runs' => $normalizedRuns];
        }
    }

    return [
        'schema' => 1,
        'documentId' => $documentId,
        'documentVersion' => $documentVersion,
        'clientRevision' => $clientRevision,
        'mutationId' => $mutationId,
        'reactions' => $normalizedReactions,
    ];
}

function normalize_intervals(array $runs): array
{
    usort($runs, static fn(array $left, array $right): int =>
        $left['start'] <=> $right['start'] ?: $left['end'] <=> $right['end']
    );

    $normalized = [];
    foreach ($runs as $run) {
        $lastIndex = count($normalized) - 1;
        if ($lastIndex >= 0 && $run['start'] <= $normalized[$lastIndex]['end']) {
            $normalized[$lastIndex]['end'] = max($normalized[$lastIndex]['end'], $run['end']);
        } else {
            $normalized[] = $run;
        }
    }

    return $normalized;
}

function interval_sets_overlap(array $leftRuns, array $rightRuns): bool
{
    $leftIndex = 0;
    $rightIndex = 0;

    while ($leftIndex < count($leftRuns) && $rightIndex < count($rightRuns)) {
        $left = $leftRuns[$leftIndex];
        $right = $rightRuns[$rightIndex];

        if ($left['start'] < $right['end'] && $right['start'] < $left['end']) {
            return true;
        }

        if ($left['end'] <= $right['start']) {
            $leftIndex += 1;
        } else {
            $rightIndex += 1;
        }
    }

    return false;
}

function rebuild_heatmap(
    array $config,
    string $documentDirectory,
    string $documentId,
    string $documentVersion,
    int $revision
): array {
    $events = [];
    $totalUsers = 0;
    $totalReactions = 0;
    $subjectDirectory = $documentDirectory . '/subjects';
    $expiresBefore = time() - (int) $config['anonymous_snapshot_ttl'];

    if (is_dir($subjectDirectory)) {
        foreach (glob($subjectDirectory . '/*.json') ?: [] as $subjectPath) {
            $snapshot = read_json_file($subjectPath, null);
            if (!is_array($snapshot)) {
                continue;
            }

            if ((int) ($snapshot['updatedAt'] ?? 0) < $expiresBefore) {
                @unlink($subjectPath);
                continue;
            }

            $contributed = false;
            foreach ($snapshot['reactions'] ?? [] as $reaction) {
                $kind = $reaction['kind'] ?? null;
                if (!in_array($kind, ['like', 'dislike'], true)) {
                    continue;
                }

                foreach ($reaction['runs'] ?? [] as $run) {
                    $start = (int) $run['start'];
                    $end = (int) $run['end'];
                    $channel = $kind === 'like' ? 'likes' : 'dislikes';
                    add_heatmap_event($events, $start, $channel, 1);
                    add_heatmap_event($events, $end, $channel, -1);
                    $totalReactions += 1;
                    $contributed = true;
                }
            }

            if ($contributed) {
                $totalUsers += 1;
            }
        }
    }

    ksort($events, SORT_NUMERIC);
    $segments = [];
    $likes = 0;
    $dislikes = 0;
    $previousPosition = null;
    $maxHits = 0;

    foreach ($events as $position => $delta) {
        $position = (int) $position;
        if ($previousPosition !== null && $position > $previousPosition && $likes + $dislikes > 0) {
            append_heatmap_segment($segments, [
                'start' => $previousPosition,
                'end' => $position,
                'likes' => $likes,
                'dislikes' => $dislikes,
            ]);
            $maxHits = max($maxHits, $likes + $dislikes);
        }

        $likes += (int) ($delta['likes'] ?? 0);
        $dislikes += (int) ($delta['dislikes'] ?? 0);
        $previousPosition = $position;
    }

    return [
        'schema' => 1,
        'documentId' => $documentId,
        'documentVersion' => $documentVersion,
        'revision' => $revision,
        'maxHits' => $maxHits,
        'totalUsers' => $totalUsers,
        'totalReactions' => $totalReactions,
        'segments' => $segments,
        'generatedAt' => gmdate(DATE_ATOM),
    ];
}

function add_heatmap_event(array &$events, int $position, string $channel, int $delta): void
{
    if (!isset($events[$position])) {
        $events[$position] = ['likes' => 0, 'dislikes' => 0];
    }
    $events[$position][$channel] += $delta;
}

function append_heatmap_segment(array &$segments, array $segment): void
{
    $lastIndex = count($segments) - 1;
    if (
        $lastIndex >= 0 &&
        $segments[$lastIndex]['end'] === $segment['start'] &&
        $segments[$lastIndex]['likes'] === $segment['likes'] &&
        $segments[$lastIndex]['dislikes'] === $segment['dislikes']
    ) {
        $segments[$lastIndex]['end'] = $segment['end'];
        return;
    }

    $segments[] = $segment;
}

function exclude_subject_snapshot_from_heatmap(array $heatmap, mixed $snapshot): array
{
    if (!is_array($snapshot)) {
        return [
            ...$heatmap,
            'excludesCurrentSubject' => true,
        ];
    }

    $events = [];
    foreach ($heatmap['segments'] ?? [] as $segment) {
        $start = (int) ($segment['start'] ?? 0);
        $end = (int) ($segment['end'] ?? 0);
        $likes = max(0, (int) ($segment['likes'] ?? 0));
        $dislikes = max(0, (int) ($segment['dislikes'] ?? 0));
        if ($end <= $start) {
            continue;
        }

        add_heatmap_event($events, $start, 'likes', $likes);
        add_heatmap_event($events, $end, 'likes', -$likes);
        add_heatmap_event($events, $start, 'dislikes', $dislikes);
        add_heatmap_event($events, $end, 'dislikes', -$dislikes);
    }

    $subjectRunCount = 0;
    foreach ($snapshot['reactions'] ?? [] as $reaction) {
        $kind = $reaction['kind'] ?? null;
        if (!in_array($kind, ['like', 'dislike'], true)) {
            continue;
        }

        $channel = $kind === 'like' ? 'likes' : 'dislikes';
        foreach ($reaction['runs'] ?? [] as $run) {
            $start = (int) ($run['start'] ?? 0);
            $end = (int) ($run['end'] ?? 0);
            if ($end <= $start) {
                continue;
            }

            add_heatmap_event($events, $start, $channel, -1);
            add_heatmap_event($events, $end, $channel, 1);
            $subjectRunCount += 1;
        }
    }

    ksort($events, SORT_NUMERIC);
    $segments = [];
    $likes = 0;
    $dislikes = 0;
    $previousPosition = null;
    $maxHits = 0;

    foreach ($events as $position => $delta) {
        $position = (int) $position;
        if ($previousPosition !== null && $position > $previousPosition) {
            $segmentLikes = max(0, $likes);
            $segmentDislikes = max(0, $dislikes);
            if ($segmentLikes + $segmentDislikes > 0) {
                append_heatmap_segment($segments, [
                    'start' => $previousPosition,
                    'end' => $position,
                    'likes' => $segmentLikes,
                    'dislikes' => $segmentDislikes,
                ]);
                $maxHits = max($maxHits, $segmentLikes + $segmentDislikes);
            }
        }

        $likes += (int) ($delta['likes'] ?? 0);
        $dislikes += (int) ($delta['dislikes'] ?? 0);
        $previousPosition = $position;
    }

    return [
        ...$heatmap,
        'maxHits' => $maxHits,
        'totalUsers' => max(0, (int) ($heatmap['totalUsers'] ?? 0) - ($subjectRunCount > 0 ? 1 : 0)),
        'totalReactions' => max(0, (int) ($heatmap['totalReactions'] ?? 0) - $subjectRunCount),
        'segments' => $segments,
        'excludesCurrentSubject' => true,
    ];
}

function authenticate_anonymous_subject(array $config): array
{
    $token = bearer_token();
    if ($token === null) {
        throw new RelikesApiError(401, 'missing_token', 'An anonymous session token is required.');
    }

    $payload = verify_token($token, load_secret($config));
    if (($payload['v'] ?? null) !== 1 || !isset($payload['sid'], $payload['exp'])) {
        throw new RelikesApiError(401, 'invalid_token', 'The anonymous session token is invalid.');
    }
    if ((int) $payload['exp'] < time()) {
        throw new RelikesApiError(401, 'expired_token', 'The anonymous session token has expired.');
    }
    if (!is_string($payload['sid']) || !preg_match('/^[a-f0-9]{32}$/', $payload['sid'])) {
        throw new RelikesApiError(401, 'invalid_subject', 'The anonymous subject is invalid.');
    }

    return ['type' => 'anonymous', 'id' => $payload['sid']];
}

function sign_token(array $payload, string $secret): string
{
    $encodedPayload = base64url_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $signature = hash_hmac('sha256', $encodedPayload, $secret, true);
    return $encodedPayload . '.' . base64url_encode($signature);
}

function verify_token(string $token, string $secret): array
{
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        throw new RelikesApiError(401, 'invalid_token', 'The anonymous session token is malformed.');
    }

    [$encodedPayload, $encodedSignature] = $parts;
    $providedSignature = base64url_decode($encodedSignature);
    $expectedSignature = hash_hmac('sha256', $encodedPayload, $secret, true);
    if ($providedSignature === null || !hash_equals($expectedSignature, $providedSignature)) {
        throw new RelikesApiError(401, 'invalid_token', 'The anonymous session signature is invalid.');
    }

    $decodedPayload = base64url_decode($encodedPayload);
    if ($decodedPayload === null) {
        throw new RelikesApiError(401, 'invalid_token', 'The anonymous session payload is invalid.');
    }

    try {
        $payload = json_decode($decodedPayload, true, 16, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new RelikesApiError(401, 'invalid_token', 'The anonymous session payload is invalid.');
    }

    if (!is_array($payload)) {
        throw new RelikesApiError(401, 'invalid_token', 'The anonymous session payload is invalid.');
    }

    return $payload;
}

function bearer_token(): ?string
{
    $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
        return trim($matches[1]);
    }

    $headerToken = trim((string) ($_SERVER['HTTP_X_RELIKES_TOKEN'] ?? ''));
    return $headerToken !== '' ? $headerToken : null;
}

function enforce_rate_limit(array $config, string $scope, string $key, array $rule): void
{
    $directory = $config['data_dir'] . '/rate-limits/' . hash('sha256', $scope);
    ensure_directory($directory);
    $path = $directory . '/' . hash('sha256', $key) . '.json';
    $handle = fopen($path, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        throw new RelikesApiError(503, 'rate_limit_unavailable', 'Rate limiting is temporarily unavailable.');
    }

    try {
        rewind($handle);
        $raw = stream_get_contents($handle);
        $state = $raw ? json_decode($raw, true) : null;
        $now = time();
        $window = max(1, (int) $rule['window']);
        $limit = max(1, (int) $rule['limit']);

        if (!is_array($state) || (int) ($state['resetAt'] ?? 0) <= $now) {
            $state = ['count' => 0, 'resetAt' => $now + $window];
        }

        $state['count'] = (int) $state['count'] + 1;
        if ($state['count'] > $limit) {
            header('Retry-After: ' . max(1, (int) $state['resetAt'] - $now));
            throw new RelikesApiError(429, 'rate_limited', 'Too many requests. Please retry later.');
        }

        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($state));
        fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function with_document_lock(string $documentDirectory, int $mode, callable $callback): mixed
{
    ensure_directory($documentDirectory);
    $handle = fopen($documentDirectory . '/document.lock', 'c+');
    if ($handle === false || !flock($handle, $mode)) {
        throw new RelikesApiError(503, 'storage_locked', 'Document storage is temporarily unavailable.');
    }

    try {
        return $callback();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function atomic_write_json(string $path, array $value): void
{
    ensure_directory(dirname($path));
    $json = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $temporary = tempnam(dirname($path), '.relikes-');
    if ($temporary === false) {
        throw new RuntimeException('Could not create a temporary data file.');
    }

    try {
        if (file_put_contents($temporary, $json . "\n", LOCK_EX) === false) {
            throw new RuntimeException('Could not write a temporary data file.');
        }
        @chmod($temporary, 0600);
        if (!rename($temporary, $path)) {
            throw new RuntimeException('Could not replace a data file atomically.');
        }
    } finally {
        if (is_file($temporary)) {
            @unlink($temporary);
        }
    }
}

function read_json_file(string $path, mixed $fallback): mixed
{
    if (!is_file($path)) {
        return $fallback;
    }

    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $fallback;
    }

    try {
        return json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        return $fallback;
    }
}

function load_documents(array $config): array
{
    $documents = read_json_file($config['documents_file'], null);
    if (!is_array($documents)) {
        throw new RelikesApiError(500, 'invalid_documents', 'The document manifest is unavailable.');
    }
    return $documents;
}

function get_document_spec(array $config, string $documentId, string $version): array
{
    $documents = load_documents($config);
    $spec = $documents[$documentId]['versions'][$version] ?? null;

    if (!is_array($spec) || empty($spec['active'])) {
        throw new RelikesApiError(404, 'document_not_found', 'The document version is not registered.');
    }

    $contentLength = (int) ($spec['contentLength'] ?? 0);
    if ($contentLength <= 0) {
        throw new RelikesApiError(500, 'invalid_document_length', 'The document length is invalid.');
    }

    return ['contentLength' => $contentLength];
}

function document_directory(array $config, string $documentId, string $version): string
{
    return $config['data_dir'] . '/documents/' . hash('sha256', $documentId . "\0" . $version);
}

function load_secret(array $config): string
{
    $configured = $config['secret'];
    if (is_string($configured) && strlen($configured) >= 32) {
        return $configured;
    }

    $path = $config['data_dir'] . '/.secret';
    if (is_file($path)) {
        $secret = trim((string) file_get_contents($path));
        if (strlen($secret) >= 64) {
            return $secret;
        }
    }

    $secret = bin2hex(random_bytes(32));
    $handle = @fopen($path, 'x');
    if ($handle !== false) {
        fwrite($handle, $secret . "\n");
        fclose($handle);
        @chmod($path, 0600);
        return $secret;
    }

    $existing = trim((string) @file_get_contents($path));
    if (strlen($existing) >= 64) {
        return $existing;
    }

    throw new RelikesApiError(500, 'secret_unavailable', 'The signing secret is unavailable.');
}

function initialize_storage(array $config): void
{
    ensure_directory($config['data_dir']);
    ensure_directory($config['data_dir'] . '/documents');
    ensure_directory($config['data_dir'] . '/rate-limits');
    cleanup_expired_rate_limit_files($config['data_dir'] . '/rate-limits');
}

function cleanup_expired_rate_limit_files(string $directory): void
{
    $now = time();
    $marker = $directory . '/.last-cleanup';
    if (is_file($marker) && (int) filemtime($marker) > $now - 3600) {
        return;
    }

    $lock = @fopen($directory . '/.cleanup.lock', 'c+');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
        if (is_resource($lock)) {
            fclose($lock);
        }
        return;
    }

    try {
        clearstatcache(true, $marker);
        if (is_file($marker) && (int) filemtime($marker) > $now - 3600) {
            return;
        }

        foreach (glob($directory . '/*/*.json') ?: [] as $path) {
            $state = read_json_file($path, null);
            if (!is_array($state) || (int) ($state['resetAt'] ?? 0) <= $now) {
                @unlink($path);
            }
        }

        @touch($marker, $now);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function ensure_directory(string $path): void
{
    if (is_dir($path)) {
        return;
    }
    if (!mkdir($path, 0700, true) && !is_dir($path)) {
        throw new RuntimeException('Could not create data directory.');
    }
}

function read_json_body(int $maxBytes): array
{
    $declaredLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($declaredLength > $maxBytes) {
        throw new RelikesApiError(413, 'body_too_large', 'The JSON request body is too large.');
    }

    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || $raw === '') {
        throw new RelikesApiError(400, 'missing_body', 'A JSON request body is required.');
    }
    if (strlen($raw) > $maxBytes) {
        throw new RelikesApiError(413, 'body_too_large', 'The JSON request body is too large.');
    }

    try {
        $payload = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new RelikesApiError(400, 'invalid_json', 'The request body is not valid JSON.');
    }

    if (!is_array($payload)) {
        throw new RelikesApiError(400, 'invalid_payload', 'The JSON payload must be an object.');
    }

    return $payload;
}

function require_json_content_type(): void
{
    $contentType = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($contentType !== 'application/json') {
        throw new RelikesApiError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
    }
}

function validate_identifier(mixed $value, string $field, int $minimumLength = 1): string
{
    if (!is_string($value)) {
        throw new RelikesApiError(422, 'invalid_' . $field, $field . ' must be a string.');
    }
    if (
        strlen($value) < $minimumLength ||
        strlen($value) > 128 ||
        !preg_match('/^[A-Za-z0-9._:-]+$/', $value)
    ) {
        throw new RelikesApiError(422, 'invalid_' . $field, $field . ' has an invalid format.');
    }
    return $value;
}

function validate_integer(mixed $value, string $field, int $minimum, int $maximum): int
{
    if (!is_int($value) || $value < $minimum || $value > $maximum) {
        throw new RelikesApiError(422, 'invalid_' . $field, $field . ' must be an integer in range.');
    }
    return $value;
}

function request_ip(): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : 'unknown';
}

function apply_request_headers(array $config): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');

    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin !== '') {
        $allowed = is_same_origin($origin) || in_array($origin, $config['allowed_origins'], true);
        if (!$allowed) {
            throw new RelikesApiError(403, 'origin_not_allowed', 'This request origin is not allowed.');
        }

        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Relikes-Token');
        header('Access-Control-Max-Age: 600');
    }
}

function is_same_origin(string $origin): bool
{
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    if ($host === '') {
        return false;
    }
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return hash_equals(strtolower($scheme . '://' . $host), strtolower(rtrim($origin, '/')));
}

function base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64url_decode(string $value): ?string
{
    if (!preg_match('/^[A-Za-z0-9_-]*$/', $value)) {
        return null;
    }

    $padding = strlen($value) % 4;
    if ($padding) {
        $value .= str_repeat('=', 4 - $padding);
    }
    $decoded = base64_decode(strtr($value, '-_', '+/'), true);
    return $decoded === false ? null : $decoded;
}

function respond_json(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
    exit;
}
