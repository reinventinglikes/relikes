// SPDX-FileCopyrightText: 2026 kotoverse
// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/relikes.js', import.meta.url), 'utf8');
const context = {
  window: {},
  NodeFilter: { SHOW_TEXT: 4 },
  document: {
    createTreeWalker(root) {
      let cursor = 0;
      return { nextNode: () => root.nodes[cursor++] };
    },
    createRange() {
      let node, start, end;
      return {
        setStart(value, offset) { node = value; start = offset; },
        setEnd(value, offset) { end = offset; },
        getClientRects() {
          return /^\s+$/.test(node.nodeValue.slice(start, end)) ? []
            : [{ left: start * 8, top: 0, width: 8, height: 18 }];
        },
        getBoundingClientRect: () => ({ width: 0, height: 0 })
      };
    }
  }
};
vm.runInNewContext(source, context);
const relikes = context.window.Relikes;

function indexText(...values) {
  return relikes.buildContentIndex({
    nodes: values.map(nodeValue => ({ nodeValue })), scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0 })
  });
}

test('indexed range lookup preserves full-grapheme containment, gaps, and unusual boundaries', () => {
  const index = indexText(' A e\u0301 👩🏽‍💻\n', '🇬🇧 العربية 中文 Z ');
  const bounds = [-Infinity, -1, 0, null, undefined, NaN, Infinity, '3'];
  for (let offset = 0; offset <= index.text.length + 1; offset += 0.5) bounds.push(offset);
  for (const start of bounds) {
    for (const end of bounds) {
      const expected = index.fragments.filter(fragment => fragment.globalStart >= start && fragment.globalEnd <= end);
      assert.deepEqual(relikes.getFragmentsForRange(index, start, end), expected);
    }
  }
  assert.equal(relikes.getFragmentsForRange(indexText('   '), 0, 3).length, 0);
});

test('caller-supplied unsorted and overlapping fragments retain filter semantics', () => {
  const index = { fragments: [
    { globalStart: 9, globalEnd: 12 }, { globalStart: 0, globalEnd: 20 },
    { globalStart: 3, globalEnd: 5 }, { globalStart: 1, globalEnd: 7 }
  ] };
  assert.deepEqual(relikes.getFragmentsForRange(index, 1, 12), [index.fragments[0], index.fragments[2], index.fragments[3]]);
});

test('short range lookup reads logarithmically many offsets on long documents', () => {
  const index = indexText('a'.repeat(50000));
  let reads = 0;
  for (const fragment of index.fragments) {
    for (const key of ['globalStart', 'globalEnd']) {
      const value = fragment[key];
      Object.defineProperty(fragment, key, { get() { reads++; return value; } });
    }
  }
  const result = relikes.getFragmentsForRange(index, 25000, 25012);
  assert.equal(result.length, 12);
  assert.ok(reads < 40, `read ${reads} offsets`);
});

test('large heatmaps avoid argument limits and preserve exact counts and quantization', () => {
  const count = 150000;
  const index = { fragments: Array.from({ length: count }, (_, i) => ({
    index: i, globalStart: i, globalEnd: i + 1, text: 'a',
    x: (i % 100) * 8, y: Math.floor(i / 100) * 24,
    width: 8, height: 18, centerX: (i % 100) * 8 + 4, centerY: Math.floor(i / 100) * 24 + 9
  })) };
  const entries = relikes.buildHeatmapEntries({ segments: [
    { start: 0, end: count / 2, likes: 3, dislikes: 0 },
    { start: count / 2, end: count, likes: 9, dislikes: 0 }
  ] }, index, undefined, undefined, { maxSteps: 3 });
  assert.equal(entries.length, 2);
  assert.deepEqual(Array.from(entries, entry => [entry.heatmap.count, entry.heatmap.maxChannelHits, entry.heatmap.level]),
    [[3, 9, 1], [9, 9, 3]]);
  assert.ok(entries.every(entry => entry.stamps.length > 0));
});
