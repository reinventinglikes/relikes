<!--
SPDX-FileCopyrightText: 2026 kotoverse
SPDX-License-Identifier: MIT
-->

# Re:Likes PHP JSON backend

This simple backend accompanies Re:Likes 1.1.0 and the live example at [relikes.com](https://relikes.com). Demo HTML is not included in the repository. The backend requires PHP 8.1 or newer and uses no database or external package. Local reactions remain available immediately through localStorage; `relikes.js` owns the canonical snapshot, identity, synchronization, and heatmap protocol.

The endpoint and route layout are supplied when each Re:Likes instance is initialized:

```js
backend: {
  url: './php-backend/api.php',
  documentId: 'relikes-v1-1-playground-doc-1',
  documentVersion: 'demo-v1',
  routes: {
    session: { url: '?action=session', method: 'POST' },
    reactions: { url: '?action=reactions', method: 'PUT' },
    heatmap: { url: '?action=heatmap', method: 'GET' }
  }
}
```

Routes may instead be relative paths, absolute URLs, route functions, or requests handled by the optional `backend.request` callback. This lets PHP, Node.js, Go, Python, CMS plugins, and edge workers implement the same Re:Likes data contract without another browser-side library.

`backend.documentId` defaults to the instance's `docId`, but an explicit stable value is recommended. It identifies the particular selectable region, not merely its page, post, or URL. Multiple Re:Likes instances on one page therefore need distinct document IDs.

An authenticated integration may pass `backend.userId`, `backend.credentials`, and `backend.headers`. The backend must always verify a supplied user ID against its trusted session or token; the browser-provided value is not proof of identity. When `backend.userId` is absent, the core uses the anonymous session route.

## Endpoints

All routes use `api.php?action=...` so the prototype works without URL rewriting.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `?action=health` | Check configuration and registered documents |
| `POST` | `?action=session` | Issue a signed anonymous subject token |
| `POST` or `PUT` | `?action=reactions` | Replace that subject's reaction snapshot |
| `GET` | `?action=heatmap&documentId=...&documentVersion=...` | Read the aggregate heatmap |

A fresh anonymous reader requests the public heatmap without creating a session. After that reader first saves a reaction, the client has a signed token and adds `excludeCurrentUser=1` to subsequent heatmap requests. The legacy `excludeSubject=1` spelling is also accepted by this backend. For compatibility with an older cached client, an exclusion request without a token falls back to the public heatmap; a supplied but invalid token still returns `401`. An authenticated exclusion request returns the aggregate without that subject, allowing the renderer to combine everyone else’s counts with the current user’s immediate local reactions without double-counting them. Personalized responses are private and are not cached by clients or shared proxies.

The backend keeps exact aggregate counts in its cache and returns `maxSteps` as a visual-intensity cap. Its default is `100`, configured by `heatmap_max_steps` in `config.php`. Exact cached counts are retained so personalized responses can subtract the current subject before the browser groups the result into visual levels.

This PHP prototype does not yet accept a registered user ID from the reaction body. Its anonymous identity comes from a signed bearer token. A registered integration must authenticate the request independently and verify that any supplied `userId` matches that trusted identity.

## Run locally

From this directory:

```bash
php -S 127.0.0.1:8787
```

Check health:

```bash
curl -sS 'http://127.0.0.1:8787/api.php?action=health'
```

Create an anonymous session:

```bash
curl -sS -X POST 'http://127.0.0.1:8787/api.php?action=session'
```

Copy the returned `token`, then submit the included fixture:

```bash
curl -sS -X PUT \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer REPLACE_WITH_TOKEN' \
  --data-binary @example-reactions.json \
  'http://127.0.0.1:8787/api.php?action=reactions'
```

Read the heatmap:

```bash
curl -sS \
  'http://127.0.0.1:8787/api.php?action=heatmap&documentId=relikes-v1-1-playground-doc-1&documentVersion=demo-v1'
```

Read a heatmap excluding the current anonymous subject:

```bash
curl -sS \
  -H 'Authorization: Bearer REPLACE_WITH_TOKEN' \
  'http://127.0.0.1:8787/api.php?action=heatmap&documentId=relikes-v1-1-playground-doc-1&documentVersion=demo-v1&excludeCurrentUser=1'
```

Create more session tokens and submit snapshots with different `clientRevision` and `mutationId` values to see counts aggregate. Repeating the same `mutationId` is idempotent. Reusing a subject token with an equal or lower client revision and a different mutation ID returns `409`.

## Storage model

Runtime files are created in `../.relikes-php-data/` by default, outside the directory served by the local command above:

```text
.relikes-php-data/
  .secret
  documents/<document hash>/
    document.lock
    state.json
    heatmap.json
    subjects/<subject hash>.json
  rate-limits/<scope hash>/<client hash>.json
```

Writes hold one document lock and replace JSON files through a temporary file plus `rename()`. Heatmap reads lazily rebuild a sweep-line aggregate only after a document has been marked dirty. Same-kind ranges are normalized before storage, and snapshots containing an overlap between one subject's likes and dislikes are rejected.

For deployment, set `RELIKES_DATA_DIR` to a durable directory outside the public web root. The included `data/.htaccess` is a fallback if you deliberately point storage back into that directory on Apache; it does not protect files on every web server.

## Configuration

Environment variables:

| Variable | Purpose |
| --- | --- |
| `RELIKES_DATA_DIR` | Runtime data location |
| `RELIKES_SECRET` | HMAC secret of at least 32 characters |

If `RELIKES_SECRET` is absent, the prototype generates `.relikes-php-data/.secret`. Keep this file stable or existing anonymous tokens will stop working.

Same-origin requests are accepted automatically. For a frontend hosted on another origin, add its exact origin to `$allowedOrigins` near the top of `config.php`:

```php
$allowedOrigins = [
    'https://example.com',
];
```

`documents.json` is an allowlist. Its current fixture registers the live playground as `relikes-v1-1-playground-doc-1`, version `demo-v1`, with an indexed content length of `1382`. Update the version and length whenever the selectable text changes.

## Data and privacy

The backend stores pseudonymous anonymous-subject snapshots containing document IDs, reaction kinds, text offsets, revisions, mutation IDs, and timestamps. Snapshots expire after `anonymous_snapshot_ttl`. Session tokens expire after `anonymous_token_ttl`.

Raw IP addresses are used as input to hashed rate-limit filenames and are not written into the record contents. These hashes are pseudonymous identifiers rather than anonymous data. The files contain a count and reset time, and expired files are removed by hourly garbage collection. Ordinary web-server access logs may still contain IP addresses; operators must configure and disclose those separately.

The prototype has no email identity and therefore no email-based export or erasure endpoint. An operator can delete a subject file when presented with a verified token-derived subject ID, or remove all runtime data. Production integrations should implement the access and erasure process required by their identity system and jurisdiction.

## Prototype limits

- The JSON backend is intended for demos and modest traffic, not a large production installation.
- Anonymous users can request new identities by clearing storage, so rate limiting reduces abuse but cannot guarantee one human equals one vote.
- IP limits use `REMOTE_ADDR` and intentionally ignore forwarding headers unless a trusted proxy integration is added later. Expired hashed limit records are garbage-collected at most once per hour.
- Registered-user authentication is not included yet; the connected demo currently uses signed anonymous sessions.
- Expired anonymous snapshots are removed during heatmap rebuilds.
