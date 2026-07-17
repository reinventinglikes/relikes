<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# Public API

Re:Likes is an IIFE browser script that exposes `window.Relikes`. Load Clean Selection `1.1.0` first unless using the standalone build.

## Primary API

### `Relikes.version`

The library version string, currently `1.1.0`.

### `Relikes.attach(element, options?)`

Creates and returns a live Re:Likes instance for an `HTMLElement`. It builds the content index, restores local reactions, creates the overlay, attaches Clean Selection, and starts backend synchronization when configured.

```js
const instance = Relikes.attach(document.querySelector('article'), {
  docId: 'article:42',
  userKey: 'my-site-reader-v1',
  viewMode: 'mine',
  eraseEnabled: true
});
```

### Instance methods

- `refresh()` rebuilds the text index and local reaction view after content changes.
- `render()` redraws the current view.
- `getReactionAlpha()` returns normalized local-reaction opacity.
- `getViewMode()` returns `mine` or `heatmap`.
- `setViewMode(mode)` changes the view and returns the resulting mode.
- `setHeatmapData(response)` validates and applies aggregate data.
- `getHeatmapState()` returns a normalized copy of aggregate state.
- `getMine()` returns the current reader's reactions for this document.
- `getCounts()` returns the current reader's Like and Dislike counts.
- `setEraseEnabled(boolean)` enables or disables erase gestures.
- `clearUser()` removes this reader's local reactions and schedules synchronization.
- `getBackendState()` returns synchronization state or `null`.
- `refreshBackendHeatmap()` requests fresh aggregate data when a backend exists.
- `flushBackend()` immediately attempts a pending snapshot write.
- `eraseAtPoint(clientX, clientY)` removes the reader's reaction fragments under a viewport point.
- `destroy()` stops synchronization, destroys overlays and Clean Selection, and releases resources.

## Storage and identity

### `getOrCreateUserId(key?)`

Returns the random reader ID stored under the supplied localStorage key. If storage is unavailable, it returns an in-memory random ID for the current page.

### `LocalReactionStore`

The default localStorage adapter. Its methods are `read`, `write`, `listReactions`, `saveReaction`, `removeReaction`, and `clearUser`. A custom `options.store` must implement the four reaction-oriented methods used by an instance.

## Text index and anchors

- `buildContentIndex(root)` segments selectable rendered text and assigns global offsets.
- `createAnchorFromSelection(indices, index)` creates a version-two, possibly multi-run anchor.
- `createAnchorFromQuote(quote, index)` anchors the first exact occurrence of a quote.
- `createAnchorFromOffsets(start, end, index)` creates a normalized text-quote anchor.
- `resolveAnchor(index, anchor)` returns the total resolved range and individual runs.
- `resolveAnchorRuns(index, anchor)` resolves every stored run after text changes.
- `getFragmentsForRange(index, start, end)` returns fragments fully inside an offset range.
- `getFragmentsForAnchor(index, anchor)` returns a flat fragment list.
- `getFragmentRunsForAnchor(index, anchor)` preserves separate anchor runs.

Anchors store offsets plus exact text and short prefix/suffix context. Resolution first tries original offsets, then chooses the best contextual exact-text match.

## Overlay and heatmap helpers

- `buildEntriesFromReactions(...)` converts stored reactions into overlay entries.
- `createOverlayEntryFromReaction(...)` converts one reaction.
- `createOverlayEntryFromAnchor(...)` builds an entry from an anchor and appearance.
- `buildHeatmapEntries(response, index, colors?, geometry?, options?)` converts normalized aggregate segments.
- `buildFinalRects(fragments, geometry?)` and `buildFinalStamps(...)` create settled geometry.
- `normalizeRect(rect, geometry?)` adds geometry padding and normalized coordinates.

`CloudOverlay` is exported for advanced custom visualizations. Its constructor and `setEntries`, `resize`, `requestRender`, `sprayCloud`, and `destroy` methods are experimental.

## Backend classes

`RelikesApiClient` and `RelikesBackendSync` are exported so advanced integrations can inspect or replace synchronization behavior. Their non-underscore methods are experimental. Prefer `options.backend` and the instance's backend methods for stable integrations.

## Utilities

`Relikes.utils` exposes `clamp`, `rgba`, `mixColor`, `signedNoise`, and `withDetachedOverlayChildren`. These expert helpers are experimental because they primarily support the renderer and external configurator.

Every named source callable—including hidden implementation helpers—is listed in [FUNCTIONS.md](FUNCTIONS.md).
