// SPDX-FileCopyrightText: 2026 kotoverse
// SPDX-License-Identifier: MIT

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const terserVersion = '5.49.0';
const expectedSha256 = '0c6e7bcbe21927c8c9a62dffa9ee2eaf83c63cfef8c2e40fd9b511fdf4a3b30b';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = resolve(
  process.env.TERSER_BUNDLE ||
  resolve(tmpdir(), 'kotoverse-js-tools', `terser-${terserVersion}.bundle.min.js`)
);

async function firstReadable(paths) {
  for (const path of paths) {
    if (!path) continue;
    try {
      await access(path);
      return path;
    } catch {
      // Try the next supported source location.
    }
  }
  throw new Error('Clean Selection 1.1.1 was not found. Set CLEAN_SELECTION_SOURCE, use a sibling checkout, or install cleanselection.');
}

async function loadTerser() {
  let bundle;
  try {
    bundle = await readFile(bundlePath);
  } catch {
    throw new Error(`Terser ${terserVersion} is not cached. Run node scripts/fetch-terser.mjs first.`);
  }

  const actualSha256 = createHash('sha256').update(bundle).digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Terser bundle checksum mismatch at ${bundlePath}.`);
  }

  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundle.toString('utf8'), sandbox, { filename: bundlePath });
  if (typeof sandbox.Terser?.minify !== 'function') {
    throw new Error('The pinned Terser bundle did not expose its minify API.');
  }
  return sandbox.Terser;
}

async function minify(terser, source, outputPath, requiredTokens) {
  const result = await terser.minify(source, {
    compress: true,
    ecma: 2020,
    mangle: true,
    safari10: true,
    format: {
      comments: 'some'
    }
  });
  const minified = result.code.trimEnd() + '\n';
  for (const token of requiredTokens) {
    if (!minified.includes(token)) {
      throw new Error(`Minified output lost required token: ${token}.`);
    }
  }
  await writeFile(resolve(root, outputPath), minified);
}

const cleanSelectionPath = await firstReadable([
  process.env.CLEAN_SELECTION_SOURCE ? resolve(process.env.CLEAN_SELECTION_SOURCE) : null,
  resolve(root, '../cleanselection/src/cleanselection.js'),
  resolve(root, 'node_modules/cleanselection/dist/cleanselection.js')
]);
const cleanSelection = (await readFile(cleanSelectionPath, 'utf8')).replace(/\r\n/g, '\n').trimEnd() + '\n';
const relikes = (await readFile(resolve(root, 'src/relikes.js'), 'utf8')).replace(/\r\n/g, '\n').trimEnd() + '\n';
if (!cleanSelection.includes("CleanSelection.version = '1.1.1'")) {
  throw new Error('Standalone builds require Clean Selection 1.1.1.');
}
if (!relikes.includes("version: '1.1.1'")) {
  throw new Error('The Re:Likes source version does not match package version 1.1.1.');
}

await mkdir(resolve(root, 'dist'), { recursive: true });
const terser = await loadTerser();
await minify(terser, relikes, 'dist/relikes.min.js', ['@license MIT', 'window.Relikes']);
await minify(terser, cleanSelection, 'wordpress/relikes/assets/js/cleanselection.min.js', ['@license MIT', 'window.CleanSelection']);
await minify(terser, relikes, 'wordpress/relikes/assets/js/relikes.min.js', ['@license MIT', 'window.Relikes']);
await minify(
  terser,
  cleanSelection + '\n' + relikes,
  'dist/relikes.standalone.min.js',
  ['Clean Selection v1.1.1', 'Re:Likes v1.1.1', 'window.CleanSelection', 'window.Relikes']
);
