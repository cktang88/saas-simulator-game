// Regression tests for unsafe rendering: imported save files are untrusted, so ids and URLs taken from state
// must not break out of attributes or turn into javascript: links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { html, table } from '../public/core/ui.js';
import { normalizeLinkedin } from '../public/apps/sales/csv.js';

const EVIL = 'x" onmouseover="alert(1)';

function jsFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

test('table rowAttrs built with html`` escape an id from an imported save', () => {
  const out = String(table({ columns: [{ key: 'id', label: 'Id' }], rows: [{ id: EVIL }], rowAttrs: (r) => html`class="clickable" data-company="${r.id}"` }));
  assert.ok(!out.includes('" onmouseover="'), out);
  assert.ok(out.includes('data-company="x&quot; onmouseover=&quot;alert(1)"'));
});

test('every rowAttrs in public/ is an escaping html`` template, not a plain string', () => {
  const bad = [];
  for (const f of jsFiles('public')) {
    for (const m of readFileSync(f, 'utf8').matchAll(/rowAttrs:\s*\(\w*\)\s*=>\s*(\S)/g)) if (!/h/.test(m[1])) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test('CRM LinkedIn link only renders linkedin.com http(s) URLs', () => {
  assert.equal(normalizeLinkedin('javascript:alert(1)'), '');
  assert.equal(normalizeLinkedin('JavaScript://linkedin.com/%0aalert(1)'), '');
  assert.equal(normalizeLinkedin('linkedin.com/in/jane'), 'https://linkedin.com/in/jane');
  const src = readFileSync('public/apps/crm.js', 'utf8');
  assert.ok(!src.includes('href="${c.linkedin}"'), 'crm.js must sanitize c.linkedin before using it as an href');
});
