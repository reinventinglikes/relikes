<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# Integration guide

## Pick a build

Use `relikes.js` or `relikes.min.js` when the page already loads Clean Selection. Use `relikes.standalone.js` for readable debugging and `relikes.standalone.min.js` when one production script is operationally simpler. Do not load Clean Selection again after either standalone build.

Backend route URLs may be absolute, query-only, or relative. Query-based WordPress REST bases such as `index.php?rest_route=/relikes/v1/` are resolved by extending the `rest_route` value rather than replacing `index.php`.

WordPress deliberately uses separate registered scripts so another plugin can reuse `clean-selection-core` without duplicating it.

## Stable document identity

Each selectable region needs a stable `docId`. Backend integrations also need a `documentVersion` that changes whenever the indexed text changes. A page with multiple regions must not reuse one backend document ID for all of them.

## Local-first behavior

Reactions are committed to the configured store before network synchronization. UI callbacks therefore report immediate local state even while a backend is offline. The synchronization layer sends a complete replacement snapshot with monotonically increasing client revisions and idempotent mutation IDs.

## Authentication

A browser `userId` is a routing hint, not proof of identity. Backends must derive or verify the authenticated user from a trusted session, cookie, or token. Anonymous sessions should use random signed identifiers with bounded expiration.

## Data and privacy checklist

An adopter's notice should accurately describe:

- localStorage keys for reader identity, reaction snapshots, tokens, and sync state;
- document identifiers, text offsets, reaction kinds, timestamps, and revision metadata sent to the backend;
- whether reactions are linked to registered accounts or pseudonymous tokens;
- IP-derived abuse controls and their retention;
- reaction retention, export, erasure, expiration, and uninstall behavior;
- aggregate heatmaps and their lack of reader identities;
- any operator-added analytics, logs, proxies, or external services.

The project does not operate a hosted reaction service and does not receive adopter data. Site operators remain responsible for their own privacy policy, consent decisions, data requests, security, and jurisdiction-specific obligations.

## Content changes

Call `instance.refresh()` after changing text without replacing the root. If the root is replaced, call `destroy()` and attach a new instance. Backend document versions should prevent offsets from an old revision being applied to new text.
