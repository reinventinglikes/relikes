=== Re:Likes ===
Contributors: kotoverse
Tags: reactions, likes, heatmap, comments, annotations
Requires at least: 6.2
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.1.1
License: GPLv2 or later

Persistent like and dislike reactions attached to exact passages in WordPress posts, pages, custom post types, and comments.

== Description ==

Re:Likes bundles Clean Selection and adds passage-level Like and Dislike actions. Readers can keep their own reactions, partially erase them, and optionally switch to an aggregate heatmap.

The plugin includes:

* Post, page, public custom-post-type, and approved-comment targeting.
* Multiple Re:Likes instances on one page through stable `data-relikes-instance` keys.
* Registered WordPress users derived from cookie authentication and REST nonces.
* Signed anonymous reader sessions with configurable retention.
* Debounced snapshot synchronization and immediate localStorage feedback.
* Dedicated normalized WordPress tables for scalable range queries.
* Privacy Tools export and erase callbacks for registered users.
* Automatic invalidation when posts or comments change.

== Installation ==

1. Upload the `relikes` directory to `/wp-content/plugins/`.
2. Activate Re:Likes.
3. Open Settings > Re:Likes.
4. Choose post types, surfaces, colors, reader features, and touch-control placement.

== Storage ==

Re:Likes creates three tables using the site's WordPress table prefix:

* `relikes_documents` stores selectable-instance revisions.
* `relikes_subjects` stores one current snapshot identity per reader and document.
* `relikes_runs` stores normalized like/dislike offset ranges.

Reaction data is not stored in post meta and no external database is required. Tables and settings are retained on uninstall unless the deletion option is explicitly enabled first.

== Identity and privacy ==

Logged-in identity is always derived by WordPress on the server; a browser-provided user ID is not trusted as authentication. Anonymous readers receive a signed random token. Anonymous identities are pseudonymous and are expired by a daily cleanup task.

IP addresses are used transiently to enforce coarse request limits and are not stored in reaction tables. Anonymous users can create a new identity by clearing browser storage, so rate limiting reduces abuse but cannot guarantee one vote per human.

== Theme integration ==

Default selectors cover common classic and block themes. Custom markup can configure content and comment selectors. When more than one post-content element matches, give each one a stable key and add it to the Allowed instance keys setting, for example:

`<section data-relikes-instance="chapter-one">...</section>`

Re:Likes does not change post typography or layout. Its compact tool row is exposed through `.relikes-wp-tools`, `.relikes-wp-switch`, and `.relikes-wp-clear` for theme overrides. In theme-controlled mode, set `--relikes-control-accent`, `--relikes-control-background`, `--relikes-control-border`, `--relikes-control-text`, `--relikes-control-active-text`, `--relikes-control-clear`, and `--relikes-control-radius` on `.relikes-wp-tools`.

== Development notes ==

The JavaScript core remains backend-agnostic. The WordPress adapter supplies its REST URL, routes, document ID, optional logged-in user ID, nonce header, and request behavior when calling `Relikes.attach()`.

The first release uses lazy per-surface heatmap requests rather than a batch endpoint. This keeps the protocol small while avoiding requests for content far outside the viewport.

== Source code ==

The operational Clean Selection and Re:Likes browser cores are minified with Terser. Their complete readable sources are included beside them as `assets/js/cleanselection.js` and `assets/js/relikes.js`. Project source and build tooling are published at https://github.com/reinventinglikes/relikes.

== Changelog ==

= 1.1.1 =
* Improved reaction-range lookup and large-document heatmap scoring.
* Updated the bundled Clean Selection dependency to 1.1.1.

= 1.1.0 =
* Added a configurable maximum of 100 heatmap intensity levels by default and grouped adjacent fragments that share a visual level.
* Cached exact WordPress heatmap aggregates while preserving accurate current-reader exclusion and anonymous expiry handling.
* Updated custom-table queries and uninstall handling for WordPress.org Plugin Check compatibility.
* Allowed 0.01 increments for fractional brush controls and 0.001 values for Fog fade speed.
* Added complete brush, reaction-cloud, heatmap, cursor, control-bar, and separate post/comment geometry settings in a styled administration screen.
* Added block-theme comment defaults, excluded media attachments, and gave Re:Likes priority over overlapping Clean Selection instances.
* Rebuilt reaction and heatmap geometry after responsive layout changes and stabilized anchors across wrapping-space changes.
* Constrained overlays and touch controls to the mobile visual viewport and added centered reaction popups.
* Fixed query-based WordPress REST routes and avoided anonymous sessions for public heatmap reads, including stale-token fallback.
* Loaded Terser-minified browser cores operationally while retaining both complete readable MIT-licensed sources.
