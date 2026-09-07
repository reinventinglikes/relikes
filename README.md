<!--
SPDX-FileCopyrightText: 2026 kotoverse
SPDX-License-Identifier: MIT
-->

# Re:Likes

Re:Likes attaches persistent Like and Dislike reactions to exact passages instead of treating an entire page as one undifferentiated object. Readers paint across text, react, partially erase their own reaction, and switch between their own marks and an aggregate heatmap.

[Live demo and configurator](https://relikes.com) · [API](docs/API.md) · [Protocol](docs/PROTOCOL.md) · [MIT license](LICENSE)

Re:Likes builds on [Clean Selection](https://github.com/cleanselection/cleanselection) `1.1.1`.

## Install

Dependency-based browser build:

```html
<script src="cleanselection.js"></script>
<script src="relikes.js"></script>
<script>
  const reactions = Relikes.attach(document.querySelector('article'), {
    docId: 'article:42',
    touchEraseBar: true
  });
</script>
```

Or use the minified single-file production build:

```html
<script src="relikes.standalone.min.js"></script>
```

Package-manager consumers can install both packages:

```sh
npm install cleanselection relikes
```

The package is browser-first and creates `window.Relikes`. TypeScript declarations are included.

## Live demo

[relikes.com](https://relikes.com) demonstrates passage reactions, per-reader persistence, partial erasing, view-mode switching, aggregate heatmaps, configuration, anchor recovery, and backend synchronization. The demo HTML is intentionally hosted separately and is not part of this repository.

## Builds

- `dist/relikes.js` requires Clean Selection `1.1.1` to be loaded first.
- `dist/relikes.min.js` is its minified equivalent.
- `dist/relikes.standalone.js` includes the pinned Clean Selection code.
- `dist/relikes.standalone.min.js` is the recommended one-file production build.
- `src/relikes.js` is the canonical Re:Likes source.

The dependency-free readable build locates Clean Selection through `CLEAN_SELECTION_SOURCE`, a sibling checkout, or an installed `cleanselection` package. It downloads nothing.

Minification does not require npm, esbuild, Java, or committed tool binaries. Run `node scripts/fetch-terser.mjs` once to download the pinned Terser `5.49.0` browser bundle into the operating system's temporary tool cache, then run `node scripts/minify.mjs`. The minifier also writes the WordPress plugin's operational `cleanselection.min.js` and `relikes.min.js`; the readable cores remain alongside them for inspection. Both scripts verify the bundle's SHA-256 checksum. Set `TERSER_BUNDLE` to use a separately cached copy. CI checks the pinned Clean Selection source, regenerates all distributions, and prevents stale WordPress copies.

## Backends

The core works locally without a server. For synchronization and aggregate heatmaps, implement the compact JSON protocol documented in [PROTOCOL.md](docs/PROTOCOL.md).

An intentionally simple PHP 8.1 backend is included in [`backend/php`](backend/php). It uses JSON files, signed anonymous sessions, bounded payloads, atomic replacement, locks, retention, and rate limits. It is suitable for demos and modest deployments, not high-traffic production.

## WordPress

The maintained plugin is in [`wordpress/relikes`](wordpress/relikes). It provides its own REST implementation and normalized database tables. 

[Download the latest WordPress plugin](https://github.com/reinventinglikes/relikes/releases/latest)

The release page contains the installable `relikes-VERSION.zip`. See [WordPress integration](docs/WORDPRESS.md).

## Documentation

- [Public and advanced API](docs/API.md)
- [All configuration options](docs/CONFIGURATION.md)
- [Integration and privacy responsibilities](docs/INTEGRATION.md)
- [Backend protocol](docs/PROTOCOL.md)
- [Internal architecture](docs/INTERNALS.md)
- [Complete named-function inventory](docs/FUNCTIONS.md)

Exported expert helpers are documented, but names explicitly marked experimental may change before `2.0.0`. Hidden implementation functions and underscore-prefixed methods are not semantic-versioning contracts.

## Data and privacy

The browser core uses localStorage for reaction snapshots, a random reader identifier, anonymous session tokens, and synchronization state. A configured backend receives document identifiers, text offsets, reaction kinds, revision metadata, and an authenticated or pseudonymous reader identity. The included backends use IP-derived expiring keys for abuse controls and do not store raw IP addresses with reactions.

Adopters are responsible for their own privacy notices and legal requirements. The integration documentation provides the exact data-flow information needed to write that notice; the WordPress plugin also supplies suggested text through WordPress's Privacy Policy Guide.

## Author and license

Created by [kotoverse](https://github.com/kotoverse). Project home: [relikes.com](https://relikes.com).

Copyright © 2026 kotoverse. Released under the [MIT License](LICENSE).
