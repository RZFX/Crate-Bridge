import test from 'node:test';
import assert from 'node:assert/strict';
import { writeWithGeobs, readFileId3, getGeob, buildId3, parseId3, canEmbed } from '../js/id3.js';
import { encodeMarkers2, decodeMarkers2 } from '../js/serato.js';

const enc = (s) => new TextEncoder().encode(s);
const cat = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let n = 0; for (const x of p) { o.set(x, n); n += x.length; } return o; };
const le32 = (n) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
const file = (bytes, name) => Object.assign(new Blob([bytes]), { name });
async function embed(f, geobs) {
  const chunks = [];
  const ws = new WritableStream({ write(c) { chunks.push(Uint8Array.from(c)); } });
  const ok = await writeWithGeobs(f, ws, geobs);
  return { ok, bytes: cat(...chunks) };
}
const cues = [{ index: 1, ms: 4242, color: '00cc00', name: 'a' }];
const geobs = () => ({ 'Serato Markers2': encodeMarkers2(cues) });
const audio = enc('FAKE-AUDIO-FRAMES'.repeat(50));
const text = (id, s) => ({ id, flags: new Uint8Array(2), body: cat(new Uint8Array([3]), enc(s)) });

test('canEmbed knows its formats', () => {
  assert.ok(['a.mp3', 'a.WAV', 'a.aiff', 'a.aif'].every(canEmbed));
  assert.ok(!['a.flac', 'a.m4a', 'noext'].some(canEmbed));
});

test('MP3 without a tag gets one, audio untouched', async () => {
  const { ok, bytes } = await embed(file(audio, 'x.mp3'), geobs());
  assert.ok(ok);
  const tag = parseId3(bytes);
  assert.deepEqual(decodeMarkers2(getGeob(tag.frames, 'Serato Markers2')), cues);
  assert.deepEqual(bytes.slice(tag.total), audio);
});

test('MP3 keeps existing frames and replaces an old Serato frame', async () => {
  const old = buildId3([text('TIT2', 'Song'), text('TPE1', 'Artist')], 3);
  const first = await embed(file(cat(old, audio), 'x.mp3'), geobs());
  const second = await embed(file(first.bytes, 'x.mp3'), { 'Serato Markers2': encodeMarkers2([{ index: 0, ms: 1, color: 'cc0000', name: '' }]) });
  const frames = parseId3(second.bytes).frames;
  assert.deepEqual(frames.map((f) => f.id).sort(), ['GEOB', 'TIT2', 'TPE1']);
  assert.equal(decodeMarkers2(getGeob(frames, 'Serato Markers2'))[0].ms, 1);
});

function wav(extra = new Uint8Array(0)) {
  const fmt = cat(enc('fmt '), le32(16), new Uint8Array(16));
  const data = cat(enc('data'), le32(audio.length), audio);
  const body = cat(enc('WAVE'), fmt, data, extra);
  return cat(enc('RIFF'), le32(body.length), body);
}

test('WAV gets an id3 chunk and a corrected RIFF size', async () => {
  const src = wav();
  const { ok, bytes } = await embed(file(src, 'x.wav'), geobs());
  assert.ok(ok);
  assert.equal(new DataView(bytes.buffer).getUint32(4, true), bytes.length - 8);
  assert.deepEqual(bytes.slice(12, src.length), src.slice(12));
  const t = await readFileId3(file(bytes, 'x.wav'));
  assert.deepEqual(decodeMarkers2(getGeob(t.frames, 'Serato Markers2')), cues);
});

test('WAV with an existing id3 chunk is replaced, not duplicated', async () => {
  const tag = buildId3([text('TIT2', 'Keep me')], 3, 0);
  const chunk = cat(enc('id3 '), le32(tag.length + (tag.length & 1)), tag, new Uint8Array(tag.length & 1));
  const first = await embed(file(wav(chunk), 'x.wav'), geobs());
  const again = await embed(file(first.bytes, 'x.wav'), geobs());
  const t = await readFileId3(file(again.bytes, 'x.wav'));
  assert.deepEqual(t.frames.map((f) => f.id).sort(), ['GEOB', 'TIT2']);
  assert.equal(new TextDecoder('latin1').decode(again.bytes).split('id3 ').length - 1, 1);
});

test('unsupported tags are refused rather than damaged', async () => {
  const v22 = cat(enc('ID3'), new Uint8Array([2, 0, 0, 0, 0, 0, 10]), new Uint8Array(10), audio);
  const r = await embed(file(v22, 'x.mp3'), geobs());
  assert.equal(r.ok, false);
  assert.equal(r.bytes.length, 0);
  assert.equal((await embed(file(audio, 'x.flac'), geobs())).ok, false);
});
