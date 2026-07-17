<?php
/**
 * Re:Likes PHP backend configuration.
 *
 * SPDX-FileCopyrightText: 2026 kotoverse
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

$allowedOrigins = [
    // 'https://example.com',
];

return [
    'data_dir' => getenv('RELIKES_DATA_DIR') ?: dirname(__DIR__) . '/.relikes-php-data',
    'documents_file' => __DIR__ . '/documents.json',
    'secret' => getenv('RELIKES_SECRET') ?: null,
    'allowed_origins' => $allowedOrigins,
    'anonymous_token_ttl' => 90 * 24 * 60 * 60,
    'anonymous_snapshot_ttl' => 120 * 24 * 60 * 60,
    'heatmap_cache_ttl' => 5 * 60,
    'max_body_bytes' => 64 * 1024,
    'max_reactions' => 100,
    'max_runs' => 250,
    'rate_limits' => [
        'session_per_ip' => ['limit' => 20, 'window' => 60 * 60],
        'write_per_ip' => ['limit' => 120, 'window' => 60 * 60],
        'write_per_subject' => ['limit' => 60, 'window' => 60 * 60],
        'heatmap_per_ip' => ['limit' => 120, 'window' => 60],
    ],
];
