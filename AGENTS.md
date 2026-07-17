<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# Agent guidance

- Work in English and preserve unrelated changes.
- `src/relikes.js` is the canonical Re:Likes browser source. Clean Selection is a pinned external dependency, not a second editable source here.
- Run `npm run build` after source changes. `dist/relikes.js` is the dependency build; `dist/relikes.standalone.js` must be exactly the pinned Clean Selection source followed by Re:Likes.
- Run `npm run minify` after source changes. It regenerates distributions and the operational WordPress minified cores. Use `npm run fetch:minifier` first if the pinned Terser bundle is not cached.
- Run `npm run docs` after functions are added, removed, or renamed. Do not manually edit generated `docs/FUNCTIONS.md`.
- Keep package, core, WordPress plugin, types, documentation, fixtures, and release metadata versions synchronized.
- The WordPress plugin loads Clean Selection and Re:Likes as separate readable and minified files. Its integration PHP, CSS, and adapter code is GPL-2.0-or-later; both bundled cores remain MIT licensed.
- The simple PHP backend and fixtures are maintained source. Never commit its runtime `data` contents, signing secrets, or production configuration.
- Demo HTML is hosted at the live link in `README.md` and is intentionally not part of this repository.
- Release and tag Clean Selection before Re:Likes when the pinned Clean Selection version changes, because Re:Likes CI verifies that tag.
- Do not commit WordPress ZIP packages, operating-system metadata, runtime data, secrets, or downloaded build tools.
- Before handing off, run `npm test`, `npm run check`, and PHP syntax checks, then inspect generated-file drift.
