import test from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../js/util.js';
import { clean } from '../js/restore.js';
import { parsePdb } from '../js/rbpdb.js';
import { parseAnlz } from '../js/anlz.js';
import { readDatabase, readCrate, decodeMarkers2, decodeBeatgrid } from '../js/serato.js';
import { parseId3 } from '../js/id3.js';

test('esc neutralises markup in names that come from untrusted drives', () => {
  for (const evil of ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "' onmouseover='x", '&lt;']) {
    const out = esc(evil);
    assert.ok(!/[<>"']/.test(out), out);
  }
  assert.equal(esc(null), '');
  assert.equal(esc(42), '42');
});

test('clean() cannot be used to escape the destination folder', () => {
  for (const evil of ['..', '.', '../..', 'a/../b', '..\\x', '/etc/passwd', 'x\0y', '', '   ', '...']) {
    const out = clean(evil);
    assert.ok(out.length > 0 && !out.includes('/') && !out.includes('\\') && !out.includes('\0') && out !== '.' && out !== '..', JSON.stringify([evil, out]));
  }
  assert.equal(clean('Fun: "Mix" <2026>?'), 'Fun_ _Mix_ _2026__');
  assert.ok(clean('x'.repeat(500)).length <= 120);
});

// Corrupt or hostile library files must fail fast (throw or return), never hang.
function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
test('parsers survive random and corrupted input', () => {
  const r = rng(7);
  const bytes = (n) => Uint8Array.from({ length: n }, () => (r() * 256) | 0);
  const started = Date.now();
  for (let i = 0; i < 300; i++) {
    const b = bytes(8 + ((r() * 9000) | 0));
    const run = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof Error); } };
    run(() => parsePdb(b.buffer.slice(0)));
    run(() => parseAnlz(b.buffer.slice(0)));
    run(() => readDatabase(b.buffer.slice(0)));
    run(() => readCrate(b.buffer.slice(0)));
    run(() => decodeMarkers2(b));
    run(() => decodeBeatgrid(b));
    run(() => parseId3(b));
  }
  assert.ok(Date.now() - started < 20000, 'fuzzing took too long: possible infinite loop');
});

test('a pdb header that claims impossible sizes does not hang', () => {
  const b = new Uint8Array(4096 * 3); const dv = new DataView(b.buffer);
  dv.setUint32(4, 4096, true); dv.setUint32(8, 20, true);
  for (let t = 0; t < 20; t++) { dv.setUint32(28 + t * 16, t, true); dv.setUint32(28 + t * 16 + 8, 1, true); dv.setUint32(28 + t * 16 + 12, 2, true); }
  const t0 = Date.now();
  try { parsePdb(b.buffer); } catch { /* fine */ }
  assert.ok(Date.now() - t0 < 2000);
});
