// SPDX-FileCopyrightText: 2026 kotoverse
// SPDX-License-Identifier: MIT

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(resolve(root, 'src/relikes.js'), 'utf8');
const lines = source.split(/\r?\n/);
const entries = [];
const controls = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
const publicFunctions = new Set([
  'attach', 'getOrCreateUserId', 'buildContentIndex', 'createAnchorFromQuote',
  'createAnchorFromOffsets', 'createAnchorFromSelection', 'resolveAnchor',
  'resolveAnchorRuns', 'getFragmentsForRange', 'getFragmentsForAnchor',
  'getFragmentRunsForAnchor', 'buildHeatmapEntries', 'buildFinalStamps',
  'buildFinalRects', 'normalizeRect', 'createOverlayEntryFromAnchor',
  'createOverlayEntryFromReaction', 'buildEntriesFromReactions'
]);
const experimentalFunctions = new Set([
  'clamp', 'rgba', 'mixColor', 'signedNoise', 'withDetachedOverlayChildren'
]);
const publicClasses = new Set(['LocalReactionStore', 'RelikesInstance']);
const experimentalClasses = new Set(['RelikesApiClient', 'RelikesBackendSync', 'CloudOverlay']);

let currentClass = null;
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  const classMatch = line.match(/^  class\s+([A-Za-z_$][\w$]*)/);
  if (classMatch) {
    currentClass = classMatch[1];
    continue;
  }
  if (currentClass && /^  }\s*$/.test(line)) {
    currentClass = null;
    continue;
  }

  const functionMatch = line.match(/^  (?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
  if (functionMatch) {
    entries.push({ owner: 'function', name: functionMatch[1], signature: functionMatch[2], line: index + 1 });
    continue;
  }

  const arrowMatch = line.match(/^(\s+)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z_$][\w$]*))\s*=>/);
  if (arrowMatch) {
    const owner = arrowMatch[1].length === 2 ? 'function' : (currentClass || 'closure');
    entries.push({ owner, name: arrowMatch[2], signature: arrowMatch[3] || arrowMatch[4] || '', line: index + 1 });
    continue;
  }

  const methodMatch = line.match(/^\s{4,}(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/);
  if (methodMatch && !controls.has(methodMatch[1])) {
    entries.push({ owner: currentClass || 'object', name: methodMatch[1], signature: methodMatch[2], line: index + 1 });
  }
}

function visibility(entry) {
  if (entry.owner === 'function' && publicFunctions.has(entry.name)) return 'Public';
  if (entry.owner === 'function' && experimentalFunctions.has(entry.name)) return 'Experimental';
  if (publicClasses.has(entry.owner) && !entry.name.startsWith('_')) return 'Public';
  if (experimentalClasses.has(entry.owner) && !entry.name.startsWith('_')) return 'Experimental';
  return 'Internal';
}

function words(name) {
  return name.replace(/^_+/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
}

const rows = entries.map(entry => {
  const level = visibility(entry);
  const role = entry.name === 'constructor'
    ? `Initializes a ${entry.owner} instance.`
    : `${level === 'Internal' ? 'Implements' : 'Provides'} ${words(entry.name)} behavior.`;
  const callable = entry.owner === 'function' ? `${entry.name}(${entry.signature})` : `${entry.owner}.${entry.name}(${entry.signature})`;
  return `| \`${callable.replace(/\|/g, '\\|')}\` | ${level} | ${role} | [source](../src/relikes.js#L${entry.line}) |`;
});

const output = `<!--\nSPDX-FileCopyrightText: 2026 kotoverse\nSPDX-License-Identifier: MIT\n-->\n\n# Complete function reference\n\nThis generated inventory covers every named function, named closure, class method, constructor, and named object method in the canonical source. Anonymous callbacks are described at their call sites rather than assigned artificial API names. Public and experimental stability is defined by [API.md](API.md); internal entries may change in any release.\n\n| Callable | Visibility | Responsibility | Location |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n\nTotal documented named callables: **${entries.length}**.\n`;

await writeFile(resolve(root, 'docs/FUNCTIONS.md'), output);
