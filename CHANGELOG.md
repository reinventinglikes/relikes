<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# Changelog

This project follows [Semantic Versioning](https://semver.org/). Dates use ISO 8601.

## [1.1.1] - 2026-09-07

- Used indexed searches for reaction ranges built from ordered text fragments, retaining the general fallback for caller-supplied arrays.
- Removed temporary heatmap arrays and argument spreading so large documents retain exact scoring without argument-limit failures.
- Updated the pinned Clean Selection dependency and standalone builds to 1.1.1.
- Added regression coverage for range equivalence, lookup complexity, and large-document heatmaps.
- Preserved all existing options, public functions, reaction behavior, and visual styles.

## [1.1.0] - 2026-07-17

- Added lazy anonymous identity for public heatmaps, stale-token fallback, and query-based REST URL resolution.
- Improved semantic offset indexing and whitespace-insensitive anchor recovery across responsive layout changes.
- Added hardened overlay sizing, expanded source documentation, a synchronized standalone bundle, and the redesigned WordPress plugin.
- Allowed finer WordPress brush tuning with 0.01 increments and a 0.001 Fog fade-speed minimum.
- Bounded heatmap rendering to 100 intensity levels by default while preserving exact backend counts and immediate local reactions.
- Added exact aggregate caching and current-reader subtraction to the WordPress backend, plus WordPress.org compatibility fixes.

## [1.0.0] - 2026-07-13

- First public release of the browser library and JSON protocol.
- Added readable and minified dependency-based and standalone distributions.
- Added the simple PHP backend and Re:Likes WordPress plugin.
- Added complete public, configuration, protocol, privacy, and internal-function documentation.

[1.0.0]: https://github.com/reinventinglikes/relikes/releases/tag/v1.0.0
[1.1.0]: https://github.com/reinventinglikes/relikes/releases/tag/v1.1.0

[1.1.1]: https://github.com/reinventinglikes/relikes/releases/tag/v1.1.1
