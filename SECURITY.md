<!-- SPDX-FileCopyrightText: 2026 kotoverse -->
<!-- SPDX-License-Identifier: MIT -->

# Security policy

Security fixes are provided for the latest released major version.

Do not open a public issue for a suspected vulnerability. Use [GitHub private vulnerability reporting](https://github.com/reinventinglikes/relikes/security/advisories/new). Include affected versions, whether the browser core, PHP backend, or WordPress plugin is involved, impact, reproduction steps, and any mitigation.

Deployers must keep backend storage outside the public web root, use a stable secret with at least 32 random bytes, allow only trusted origins, and serve requests over HTTPS.
