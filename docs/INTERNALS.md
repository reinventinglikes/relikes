<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# Internal architecture

Re:Likes is a dependency-free IIFE layered over Clean Selection.

1. `buildContentIndex` segments rendered text and assigns document-wide offsets.
2. Clean Selection supplies a visual selection and popup lifecycle.
3. Text-quote anchors preserve exact text plus surrounding context and support disjoint runs.
4. `LocalReactionStore` commits a reader's state immediately.
5. `CloudOverlay` renders local reactions or normalized heatmap entries.
6. `RelikesBackendSync` debounces complete snapshots, tracks revisions and mutation IDs, retries bounded failures, and refreshes aggregate state.

The browser does not treat visual rectangles as canonical data. Anchors and UTF-16 offsets are canonical; geometry is rebuilt from current content whenever the instance refreshes. Index offsets include semantic text even when an individual grapheme has no measurable rectangle, and anchor recovery has a whitespace-insensitive fallback for responsive wrapping differences.

The PHP backend uses one locked document directory, atomic JSON replacement, signed anonymous tokens, expiration, and sweep-line heatmap aggregation. The WordPress implementation maps the same concepts into document, subject, and normalized run tables and exposes schema-one REST routes.

See [FUNCTIONS.md](FUNCTIONS.md) for the exhaustive callable inventory. Internal helpers, underscore-prefixed methods, storage JSON layout, and renderer implementation details are not stable contracts.
