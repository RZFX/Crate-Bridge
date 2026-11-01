import assert from 'node:assert/strict';
import { convertKey, parseKey } from '../js/keys.js';
const c = (s) => convertKey(s);
assert.deepEqual(c('Am'), { camelot: '8A', openkey: '1m', standard: 'Am' });
assert.deepEqual(c('C'), { camelot: '8B', openkey: '1d', standard: 'C' });
assert.deepEqual(c('B'), { camelot: '1B', openkey: '6d', standard: 'B' });
assert.deepEqual(c('E'), { camelot: '12B', openkey: '5d', standard: 'E' });
assert.equal(c('8A').standard, 'Am');
assert.equal(c('1d').camelot, '8B');
assert.equal(c('5d').camelot, '12B');
assert.equal(c('C#m').camelot, '12A');
assert.equal(c('Dbm').camelot, '12A');
assert.equal(c('F# minor').camelot, '11A');
assert.equal(parseKey('nonsense'), null);
for (let n = 1; n <= 12; n++) for (const L of 'AB') {
  const x = c(`${n}${L}`); assert.equal(c(x.openkey).camelot, `${n}${L}`); assert.equal(c(x.standard).camelot, `${n}${L}`);
}
console.log('keys ok');
