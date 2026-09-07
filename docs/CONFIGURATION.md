<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# Configuration

All fields passed to `Relikes.attach(element, options)` are optional unless noted for backend use.

## Identity, document, and storage

| Option | Default | Purpose |
| --- | --- | --- |
| `docId` | element ID or `relikes-document` | Stable local document/region identifier. |
| `userId` | generated reader ID | Explicit local reader identifier. Authentication must still be verified by a backend. |
| `userKey` | `relikes-user-v1` | localStorage key used to create or restore the random reader ID. |
| `storageKey` | `relikes-store-v1` | localStorage key for reaction snapshots. |
| `store` | `LocalReactionStore` | Custom local reaction-store implementation. |
| `eraseEnabled` | `false` | Allow erase gestures immediately. |
| `viewMode` | `mine` | Initial view: `mine` or `heatmap`. |

Use distinct `docId` values for multiple selectable regions. Changing selectable text should also change the backend `documentVersion`.

## Appearance and interaction

| Option | Default | Purpose |
| --- | --- | --- |
| `colors.selection` | `[90, 168, 255]` | Temporary selection color. |
| `colors.like` | `[85, 185, 111]` | Like overlay and heatmap color. |
| `colors.dislike` | `[223, 131, 137]` | Dislike overlay and heatmap color. |
| `geometry.radius` | `18` | Reaction cloud radius. |
| `geometry.paddingRatio` | `0.32` | Padding added around final text geometry. |
| `geometry.detectTolerance` | `3` | Fragment detection tolerance passed to Clean Selection. |
| `geometry.overlayPadding` | `72` | Canvas overflow around content. |
| `reactionAlpha` | derived | Opacity of the current reader's reaction overlay. |
| `airbrush` | `{}` | Additional Clean Selection options; Re:Likes overrides geometry and popup hooks it owns. |
| `interactiveElements` | `false` | Clean Selection interactive-descendant rules. |
| `touchEraseControl` | `false` | External touch erase controller configuration. |
| `touchEraseBar` | `true` | Built-in Select/Deselect touch bar or its configuration object. |
| `popupRenderer` | built in | Custom Re:Likes popup renderer function or lifecycle object. |

See the [Clean Selection configuration reference](https://github.com/cleanselection/cleanselection/blob/v1.1.1/docs/CONFIGURATION.md) for forwarded `airbrush` fields.

## Heatmap

| Option | Default | Purpose |
| --- | --- | --- |
| `heatmap.scale` | `linear` | Count scaling: `linear`, `sqrt`, or `log`. |
| `heatmap.minAlpha` | `0` | Minimum visible aggregate opacity. |
| `heatmap.maxAlpha` | `0.48` | Maximum aggregate opacity. |
| `heatmap.maxSteps` | `100` | Maximum visual intensity levels, clamped from 1 to 1000. |
| `heatmap.includeLocalReactions` | `true` | Combine local immediate state with aggregate data. |
| `heatmap.overlapMode` | `split` | Render Like/Dislike overlap as `split` or `blend`. |
| `heatmap.data` | empty schema-one response | Initial aggregate response. |

When the busiest Like or Dislike channel exceeds `maxSteps`, exact counts are rounded upward into evenly sized visual bands. For example, a maximum overlap of 10,000 with the default 100 levels maps counts 1–100 to level 1, 101–200 to level 2, and so on. A backend may return a lower `maxSteps` cap; the stricter client or server value wins.

## Callbacks

- `onChange(state)` runs after local reactions or counts change.
- `onViewModeChange(mode)` runs after the active view changes.
- `onHeatmapChange(response)` runs after normalized aggregate data changes.
- `onBackendChange(state)` runs after synchronization status changes.

Callbacks are notifications. Throwing from a callback should not be used to cancel an operation.

## Backend

Set `backend` to `null` or omit it for local-only use. When enabled, `url` and `documentVersion` are required.

| Field | Default | Purpose |
| --- | --- | --- |
| `enabled` | `true` | Set `false` to disable a prepared config. |
| `url` / `apiUrl` | required | Base endpoint URL. |
| `documentId` | `docId` | Stable backend document/region ID. |
| `documentVersion` | required | Version of the indexed text. |
| `userId` | `null` | Registered identity value or function; the server must authenticate it independently. |
| `routes` | session/reactions/heatmap defaults | Per-operation URL, method, or resolver. |
| `headers` | none | Headers object or resolver. |
| `credentials` | `same-origin` | Fetch credential mode. |
| `fetch` | `window.fetch` | Alternate fetch implementation. |
| `request` | `null` | Full custom request callback. |
| `tokenStorageKey` | derived | localStorage key for an anonymous bearer token. |
| `stateStorageKey` | derived | localStorage prefix for synchronization revision state. |
| `saveDebounceMs` | `1200` | Delay before an ordinary write. |
| `minWriteIntervalMs` | `5000` | Minimum interval between writes. |
| `retryBaseMs` | `5000` | Initial retry delay. |
| `retryMaxMs` | `60000` | Maximum retry delay. |

Backend delays are clamped between zero and five minutes. See [PROTOCOL.md](PROTOCOL.md) for request and response bodies.
