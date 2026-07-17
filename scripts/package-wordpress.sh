#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 kotoverse
# SPDX-License-Identifier: MIT

set -euo pipefail

version="$(node -p "require('./package.json').version")"
mkdir -p release
git archive --format=zip --output="release/relikes-${version}.zip" --prefix=relikes/ HEAD:wordpress/relikes
echo "Created release/relikes-${version}.zip"
