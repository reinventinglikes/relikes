// SPDX-FileCopyrightText: 2026 kotoverse
// SPDX-License-Identifier: MIT

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const version = '5.49.0';
const url = `https://unpkg.com/terser@${version}/dist/bundle.min.js`;
const expectedSha256 = '0c6e7bcbe21927c8c9a62dffa9ee2eaf83c63cfef8c2e40fd9b511fdf4a3b30b';
const destination = resolve(
  process.env.TERSER_BUNDLE ||
  process.argv[2] ||
  resolve(tmpdir(), 'kotoverse-js-tools', `terser-${version}.bundle.min.js`)
);

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

try {
  const existing = await readFile(destination);
  if (sha256(existing) === expectedSha256) {
    console.log(destination);
    process.exit(0);
  }
} catch {
  // The pinned tool is not cached yet.
}

const response = await fetch(url, { redirect: 'follow' });
if (!response.ok) {
  throw new Error(`Unable to download Terser ${version}: HTTP ${response.status}.`);
}

const bundle = Buffer.from(await response.arrayBuffer());
const actualSha256 = sha256(bundle);
if (actualSha256 !== expectedSha256) {
  throw new Error(`Terser ${version} checksum mismatch: ${actualSha256}.`);
}

await mkdir(dirname(destination), { recursive: true });
const temporary = `${destination}.${process.pid}.tmp`;
await writeFile(temporary, bundle);
await rename(temporary, destination);
console.log(destination);
