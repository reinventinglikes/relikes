<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# Backend protocol version 1

The core accepts route URLs, route functions, or a complete request callback. The default endpoint layout is shown below; servers may use different paths when configured accordingly.

| Method | Default route | Purpose |
| --- | --- | --- |
| `POST` | `?action=session` | Issue a signed anonymous subject token. |
| `PUT` | `?action=reactions` | Replace one subject's complete reaction snapshot. |
| `GET` | `?action=heatmap` | Read the aggregate document heatmap. |

## Anonymous session response

```json
{
  "schema": 1,
  "subjectType": "anonymous",
  "token": "signed-token",
  "expiresAt": "2026-10-11T12:00:00+00:00"
}
```

The client sends the token as `Authorization: Bearer …`. Registered integrations can omit the anonymous route, but the server must authenticate the browser's identity independently.

## Replacement snapshot

```json
{
  "schema": 1,
  "documentId": "article:42:content",
  "documentVersion": "revision-7",
  "contentLength": 1382,
  "clientRevision": 3,
  "mutationId": "reader-3-unique-mutation",
  "reactions": [
    { "kind": "like", "runs": [{ "start": 34, "end": 102 }] },
    { "kind": "dislike", "runs": [{ "start": 705, "end": 788 }] }
  ]
}
```

Runs are half-open UTF-16 text offsets: `start` is included and `end` is excluded. A subject must not Like and Dislike overlapping offsets. Servers should normalize adjacent same-kind runs, cap body and run counts, replace the previous snapshot atomically, and treat a repeated `mutationId` as idempotent. A different mutation with an equal or lower client revision should return `409` and the stored revision.

Successful writes return at least `schema`, `serverRevision`, and the accepted `clientRevision`.

## Heatmap request and response

The request includes `documentId` and `documentVersion`. A fresh anonymous reader requests the public aggregate without creating a session. Once a reader has an anonymous token—or when a registered integration supplies an authenticated identity—the client adds `excludeCurrentUser=1` to request an aggregate that excludes the current subject, allowing the browser to combine everyone else with its immediate local state without double counting. A backend may treat an exclusion request without credentials as the public aggregate for compatibility, but a supplied invalid credential must still return `401`.

```json
{
  "schema": 1,
  "revision": "18",
  "maxHits": 7,
  "maxSteps": 100,
  "totalUsers": 12,
  "totalReactions": 31,
  "segments": [
    { "start": 34, "end": 68, "likes": 5, "dislikes": 0 },
    { "start": 68, "end": 102, "likes": 5, "dislikes": 2 }
  ]
}
```

Segments are non-empty, sorted offset ranges. Personalized responses must be private and should use `Cache-Control: private, no-store`; shared aggregates can use a short public cache lifetime.

`maxSteps` is an optional browser-rendering cap, not a reaction-count limit. Backends should keep and return exact segment counts; the browser applies the cap after combining the aggregate with the current reader's immediate local reactions. This preserves correct exclusion and synchronization while bounding the number of distinct heatmap intensities.

## Errors

The included backends return an HTTP status with:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Use `400` for invalid data, `401` for missing or invalid identity, `403` for disabled or unauthorized scopes, `409` for revision conflicts, `413` for bounds, `429` for rate limits, and `5xx` for transient server failures.
