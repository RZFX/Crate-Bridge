import test from 'node:test';
import assert from 'node:assert/strict';
import { crateBytes, readCrate, encodeMarkers2, decodeMarkers2, encodeBeatgrid, decodeBeatgrid, rbToSerato, parseTags } from '../js/serato.js';

const buf = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

test('crate files round-trip, with and without unicode', () => {
  const paths = ['/Users/me/Music/a.mp3', '/Volumes/USB/Ünïcode – track.wav'];
  assert.deepEqual(readCrate(buf(crateBytes(paths))), paths);
  assert.deepEqual(readCrate(buf(crateBytes([]))), []);
});

test('crate header starts with the Serato version tag', () => {
  const [tag, payload] = parseTags(crateBytes(['/x.mp3'])).next().value;
  assert.equal(tag, 'vrsn');
  assert.equal(new TextDecoder('utf-16be').decode(payload), '1.0/Serato ScratchLive Crate');
});

test('Markers2 cues round-trip and are padded to 470 bytes', () => {
  const cues = [{ index: 0, ms: 1234, color: 'cc0000', name: '' }, { index: 7, ms: 98765, color: '8800cc', name: 'drop ✓' }];
  const data = encodeMarkers2(cues);
  assert.ok(data.length >= 470);
  assert.deepEqual(decodeMarkers2(data), cues);
});

test('Markers2 decoding tolerates garbage', () => {
  assert.deepEqual(decodeMarkers2(new Uint8Array([1, 1, 33, 33, 33])), []);
  assert.deepEqual(decodeMarkers2(null), []);
  assert.deepEqual(decodeMarkers2(new Uint8Array(0)), []);
});

test('beatgrid round-trips', () => {
  const [g] = decodeBeatgrid(encodeBeatgrid(0.25, 174));
  assert.equal(g.pos, 0.25);
  assert.equal(g.bpm, 174);
});

test('Rekordbox cues map to Serato hot-cue slots; memory cues fill free slots', () => {
  const anlz = { beats: [{ num: 1, bpm: 170, ms: 500 }], cues: [
    { hot: 2, ms: 2000 }, { hot: 0, ms: 100 }, { hot: 0, ms: 50 }, { hot: 1, ms: 1000 }] };
  const { cues, grid } = rbToSerato(anlz, 0);
  assert.deepEqual(cues.map((c) => [c.index, c.ms]), [[0, 1000], [1, 2000], [2, 50], [3, 100]]);
  assert.deepEqual(grid, [0.5, 170]);
});

test('no more than 8 hot-cue slots are used', () => {
  const memory = Array.from({ length: 20 }, (_, i) => ({ hot: 0, ms: i * 10 }));
  assert.equal(rbToSerato({ beats: [], cues: memory }, 0).cues.length, 8);
  assert.equal(rbToSerato({ beats: [], cues: [] }, 0).grid, null);
});
