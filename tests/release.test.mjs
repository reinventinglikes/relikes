// SPDX-FileCopyrightText: 2026 kotoverse
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('browser source exposes the documented API', async () => {
  const source = await readFile(resolve(root, 'src/relikes.js'), 'utf8');
  for (const token of [
    'function attach(',
    'LocalReactionStore,',
    'RelikesApiClient,',
    'buildContentIndex,',
    'createAnchorFromQuote,',
    'buildHeatmapEntries,',
    "version: '1.1.0'"
  ]) {
    assert.ok(source.includes(token), `missing ${token}`);
  }
});

test('WordPress JavaScript copies are generated from canonical sources', async () => {
  const relikes = await readFile(resolve(root, 'src/relikes.js'));
  const wordpressRelikes = await readFile(resolve(root, 'wordpress/relikes/assets/js/relikes.js'));
  assert.deepEqual(wordpressRelikes, relikes);

  const standalone = await readFile(resolve(root, 'dist/relikes.standalone.js'), 'utf8');
  const wordpressClean = await readFile(resolve(root, 'wordpress/relikes/assets/js/cleanselection.js'), 'utf8');
  assert.ok(standalone.startsWith(wordpressClean.trimEnd()));
});

test('WordPress operational cores are generated and minified', async () => {
  const readableClean = await readFile(resolve(root, 'wordpress/relikes/assets/js/cleanselection.js'), 'utf8');
  const minifiedClean = await readFile(resolve(root, 'wordpress/relikes/assets/js/cleanselection.min.js'), 'utf8');
  const minifiedRelikes = await readFile(resolve(root, 'dist/relikes.min.js'));
  const wordpressRelikes = await readFile(resolve(root, 'wordpress/relikes/assets/js/relikes.min.js'));
  assert.match(minifiedClean, /window\.CleanSelection/);
  assert.ok(Buffer.byteLength(minifiedClean) < Buffer.byteLength(readableClean));
  assert.deepEqual(wordpressRelikes, minifiedRelikes);
});

test('WordPress fractional brush controls retain fine input precision', async () => {
  const source = await readFile(
    resolve(root, 'wordpress/relikes/includes/class-relikes-plugin.php'),
    'utf8'
  );
  for (const key of [
    'brush_hardness',
    'brush_spacing',
    'brush_turbulence',
    'brush_turbulence_speed',
    'brush_padding_ratio'
  ]) {
    assert.match(source, new RegExp(`'${key}'[^?]+0\\.01 \\); \\?>`), `${key} must use a 0.01 step`);
  }
  assert.match(source, /'brush_fade_speed'[^?]+0\.001, 0\.08, 0\.001 \); \?>/);
  assert.match(source, /'brush_fade_speed'.+0\.001, 0\.08 \),/);
});

test('standalone build retains both MIT notices', async () => {
  for (const file of ['dist/relikes.standalone.js', 'dist/relikes.standalone.min.js']) {
    const standalone = await readFile(resolve(root, file), 'utf8');
    assert.match(standalone, /Clean Selection v1\.1\.0/);
    assert.match(standalone, /Re:Likes v1\.1\.0/);
    assert.equal((standalone.match(/Copyright \(c\) 2026 kotoverse/g) || []).length, 2);
  }
});

test('minified builds retain their globals and reduce size', async () => {
  const readable = await readFile(resolve(root, 'dist/relikes.js'), 'utf8');
  const minified = await readFile(resolve(root, 'dist/relikes.min.js'), 'utf8');
  const standalone = await readFile(resolve(root, 'dist/relikes.standalone.js'), 'utf8');
  const standaloneMinified = await readFile(resolve(root, 'dist/relikes.standalone.min.js'), 'utf8');
  assert.match(minified, /window\.Relikes/);
  assert.match(standaloneMinified, /window\.CleanSelection/);
  assert.match(standaloneMinified, /window\.Relikes/);
  assert.ok(Buffer.byteLength(minified) < Buffer.byteLength(readable));
  assert.ok(Buffer.byteLength(standaloneMinified) < Buffer.byteLength(standalone));
});

test('PHP backend fixtures use schema one and the public demo document key', async () => {
  const documents = JSON.parse(await readFile(resolve(root, 'backend/php/documents.json'), 'utf8'));
  const reaction = JSON.parse(await readFile(resolve(root, 'backend/php/example-reactions.json'), 'utf8'));
  assert.equal(reaction.schema, 1);
  assert.ok(documents[reaction.documentId]);
  assert.ok(documents[reaction.documentId].versions[reaction.documentVersion]);
});

test('PHP heatmap supports fresh public readers but validates supplied tokens', async () => {
  const source = await readFile(resolve(root, 'backend/php/api.php'), 'utf8');
  assert.match(
    source,
    /\$subject\s*=\s*\$excludeSubject\s*&&\s*bearer_token\(\)\s*!==\s*null\s*\?\s*authenticate_anonymous_subject\(\$config\)\s*:\s*null;/
  );
  assert.match(source, /if \(\$subject === null && trim\(/);
  assert.match(source, /'Cache-Control: public, max-age=15, stale-while-revalidate=45'/);
  assert.match(source, /'Cache-Control: private, no-store'/);
});
