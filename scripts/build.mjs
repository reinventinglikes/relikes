// SPDX-FileCopyrightText: 2026 kotoverse
// SPDX-License-Identifier: MIT

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
await writeFile(resolve(root, 'dist/relikes.js'), relikes);

const standalone = cleanSelection + '\n' + relikes;
await writeFile(resolve(root, 'dist/relikes.standalone.js'), standalone);

await writeFile(resolve(root, 'wordpress/relikes/assets/js/cleanselection.js'), cleanSelection);
await writeFile(resolve(root, 'wordpress/relikes/assets/js/relikes.js'), relikes);
