import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUses, isNewer, major } from '../scripts/check-deps.mjs';

test('reads pinned actions with their version comment', () => {
  const u = parseUses('      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n      - uses: github/codeql-action/analyze@9b32540 # v4.39.1\n      - uses: foo/bar@v2');
  assert.deepEqual(u.map((x) => [x.repo, x.version]), [['actions/checkout', 'v7.0.1'], ['github/codeql-action', 'v4.39.1'], ['foo/bar', null]]);
});

test('version comparison', () => {
  assert.ok(isNewer('v7.1.0', 'v7.0.1'));
  assert.ok(isNewer('v8.0.0', 'v7.9.9'));
  assert.ok(!isNewer('v7.0.1', 'v7.0.1'));
  assert.ok(!isNewer('v6.9.9', 'v7.0.0'));
  assert.equal(major('v22.1.0'), 22);
});
