<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# Contributing

Thank you for helping improve Re:Likes.

1. Search existing issues before opening a new one.
2. Keep browser, protocol, PHP, and WordPress changes focused and explain any compatibility effect.
3. Treat `src/relikes.js` as canonical; do not hand-edit generated `dist` files, the standalone bundle, or WordPress core copies.
4. Run `npm run build`, `npm run minify`, `npm run docs`, `npm test`, and `npm run check`. Fetch the pinned minifier first with `npm run fetch:minifier` when it is not cached.
5. Update types, API documentation, and protocol fixtures when contracts change.
6. Document any new data collection, storage, retention, or external request.

By contributing, you agree that your contribution is licensed under this project's MIT License and that you have the right to submit it. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
