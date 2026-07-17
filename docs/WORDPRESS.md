<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# WordPress plugin

The plugin in `wordpress/relikes` attaches passage reactions to public post types, post content, and optionally approved comments. Settings are available under **Settings → Re:Likes**.

It registers three scripts: `clean-selection-core`, `relikes-core`, and `relikes-wp`. Keeping the libraries separate lets WordPress reuse Clean Selection when both project plugins are active. The operational browser cores are minified; their complete readable MIT-licensed sources remain in the plugin package. WordPress integration code is GPL-2.0-or-later.

The settings screen provides separate post/comment geometry, brush, reaction-cloud, heatmap, cursor, popup, reader-control, and touch-control options. The heatmap maximum-level setting defaults to 100 and bounds rendering complexity without limiting stored reactions. Re:Likes takes page-level priority when both project plugins target the same singular page.

The plugin creates three normalized tables for document revisions, reader subjects, and offset runs. It caches exact aggregate heatmaps in the document table, invalidates them when reaction data changes or anonymous snapshots expire, and subtracts the current reader before the browser applies visual-level grouping. Registered users are authenticated through WordPress and participate in the core privacy exporter and eraser. Anonymous readers use signed random sessions with configurable retention. IP addresses are transformed into expiring transient keys for rate limiting and are not stored with reactions.

The plugin adds suggested policy text through WordPress's Privacy Policy Guide. Site administrators must review that text, account for their wider stack, and publish their own policy. Tables and settings remain after uninstall unless **Delete all data on uninstall** is selected before removal.

GitHub releases attach an installable ZIP containing both browser libraries, the adapter, PHP implementation, readme, uninstall logic, and MIT license.
