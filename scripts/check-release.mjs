// SPDX-FileCopyrightText: 2026 kotoverse
// SPDX-License-Identifier: MIT

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'AGENTS.md',
  'LICENSE',
  'README.md',
  'dist/relikes.js',
  'dist/relikes.min.js',
  'dist/relikes.standalone.js',
  'dist/relikes.standalone.min.js',
  'types/index.d.ts',
  'backend/php/api.php',
  'wordpress/relikes/LICENSE',
  'wordpress/relikes/LICENSES/MIT.txt',
  'wordpress/relikes/assets/css/admin.css',
  'wordpress/relikes/assets/css/relikes-wp.css',
  'wordpress/relikes/assets/js/cleanselection.min.js',
  'wordpress/relikes/assets/js/relikes.min.js'
];

for (const file of required) {
  await readFile(resolve(root, file));
}

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const source = await readFile(resolve(root, 'src/relikes.js'), 'utf8');
const plugin = await readFile(resolve(root, 'wordpress/relikes/relikes.php'), 'utf8');
const standalone = await readFile(resolve(root, 'dist/relikes.standalone.js'), 'utf8');
const readable = await readFile(resolve(root, 'dist/relikes.js'), 'utf8');
const minified = await readFile(resolve(root, 'dist/relikes.min.js'), 'utf8');
const standaloneMinified = await readFile(resolve(root, 'dist/relikes.standalone.min.js'), 'utf8');
if (packageJson.version !== '1.1.0' || !source.includes("version: '1.1.0'") || !plugin.includes('Version: 1.1.0')) {
  throw new Error('Release versions are not synchronized.');
}
if (!standalone.includes("CleanSelection.version = '1.1.0'") || !standalone.includes("version: '1.1.0'")) {
  throw new Error('The standalone distribution does not contain both pinned 1.1.0 libraries.');
}
if (!minified.includes('@license MIT') || !minified.includes('window.Relikes')) {
  throw new Error('The minified dependency build is missing its license or public global.');
}
for (const token of ['Clean Selection v1.1.0', 'Re:Likes v1.1.0', 'window.CleanSelection', 'window.Relikes']) {
  if (!standaloneMinified.includes(token)) {
    throw new Error(`The minified standalone build is missing ${token}.`);
  }
}
if (Buffer.byteLength(minified) >= Buffer.byteLength(readable) || Buffer.byteLength(standaloneMinified) >= Buffer.byteLength(standalone)) {
  throw new Error('A minified build is not smaller than its readable build.');
}
