// Serato: database V2, crates, and the cue / beatgrid tags Serato stores in audio files.
const dec16 = new TextDecoder('utf-16be');
const dec8 = new TextDecoder('utf-8');
const ascii = (u8, p, n) => String.fromCharCode(...u8.subarray(p, p + n));
const be32 = (u8, o) => ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
const f32 = (u8, o) => new DataView(u8.buffer, u8.byteOffset + o, 4).getFloat32(0);

export function* parseTags(u8, start = 0, end = u8.length) {
  let pos = start;
  while (pos + 8 <= end) {
    const len = be32(u8, pos + 4);
    yield [ascii(u8, pos, 4), u8.subarray(pos + 8, pos + 8 + len)];
    pos += 8 + len;
  }
}

const absPath = (s) => '/' + s.replace(/^\/+/, '');

export function readDatabase(buf) {
  const u8 = new Uint8Array(buf), tracks = [];
  for (const [tag, p] of parseTags(u8)) {
    if (tag !== 'otrk') continue;
    const d = {};
    for (const [t, v] of parseTags(p)) if (t[0] === 't' || t[0] === 'p') d[t] = dec16.decode(v);
    if (!d.pfil) continue;
    tracks.push({ path: absPath(d.pfil), title: d.tsng || '', artist: d.tart || '', album: d.talb || '',
      genre: d.tgen || '', bpm: d.tbpm || '', key: d.tkey || '', length: d.tlen || '', size: d.tsiz || '' });
  }
  return tracks;
}

export function readCrate(buf) {
  const paths = [];
  for (const [tag, p] of parseTags(new Uint8Array(buf)))
    if (tag === 'otrk') for (const [t, v] of parseTags(p)) if (t === 'ptrk') paths.push(absPath(dec16.decode(v)));
  return paths;
}

const cat = (...parts) => { const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const enc16 = (s) => { const o = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { o[i * 2] = s.charCodeAt(i) >> 8; o[i * 2 + 1] = s.charCodeAt(i) & 255; } return o; };
const u32 = (n) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const tag = (name, payload) => cat(new TextEncoder().encode(name), u32(payload.length), payload);

export function crateBytes(paths) {
  const parts = [tag('vrsn', enc16('1.0/Serato ScratchLive Crate')),
    tag('osrt', cat(tag('tvcn', enc16('key')), tag('brev', new Uint8Array([0]))))];
  for (const c of ['song', 'artist', 'album', 'bpm', 'key', 'length'])
    parts.push(tag('ovct', cat(tag('tvcn', enc16(c)), tag('tvcw', enc16('0')))));
  for (const p of paths) parts.push(tag('otrk', tag('ptrk', enc16(p.replace(/^\/+/, '')))));
  return cat(...parts);
}

// ---- Serato Markers2 (hot cues) ----
const toBin = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return s; };
const fromBin = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

export function decodeMarkers2(data) {
  const cues = [];
  if (!data || data.length < 3) return cues;
  let end = data.indexOf(0, 2); if (end < 0) end = data.length;
  let b64 = ascii(data, 2, end - 2).replace(/\s+/g, '');
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  let inner; try { inner = fromBin(atob(b64)); } catch { return cues; }
  let pos = 2;
  while (pos < inner.length && inner[pos] !== 0) {
    const e = inner.indexOf(0, pos);
    const name = ascii(inner, pos, e - pos), len = be32(inner, e + 1), body = inner.subarray(e + 5, e + 5 + len);
    pos = e + 5 + len;
    if (name === 'CUE' && body.length >= 13) {
      const nul = body.indexOf(0, 12);
      cues.push({ index: body[1], ms: be32(body, 2), color: hex(body.subarray(7, 10)),
        name: dec8.decode(body.subarray(12, nul < 0 ? body.length : nul)) });
    }
  }
  return cues;
}

export function encodeMarkers2(cues) {
  const parts = [new Uint8Array([1, 1]), new TextEncoder().encode('COLOR\0'), u32(4), new Uint8Array([0, 255, 255, 255])];
  for (const c of cues) {
    const rgb = Uint8Array.from((c.color || 'cc0000').match(/../g), (h) => parseInt(h, 16));
    const body = cat(new Uint8Array([0, c.index]), u32(Math.round(c.ms)), new Uint8Array([0]), rgb, new Uint8Array([0, 0]), new TextEncoder().encode(c.name || ''), new Uint8Array([0]));
    parts.push(new TextEncoder().encode('CUE\0'), u32(body.length), body);
  }
  parts.push(new TextEncoder().encode('BPMLOCK\0'), u32(1), new Uint8Array([0]));
  const b64 = new TextEncoder().encode(btoa(toBin(cat(...parts))));
  const out = new Uint8Array(Math.max(470, 2 + b64.length));
  out.set([1, 1]); out.set(b64, 2);
  return out;
}

// ---- Serato BeatGrid ----
export function decodeBeatgrid(data) {
  if (!data || data.length < 6) return [];
  const n = be32(data, 2), out = []; let pos = 6;
  for (let i = 0; i < n; i++, pos += 8) out.push(i < n - 1 ? { pos: f32(data, pos), beats: be32(data, pos + 4) } : { pos: f32(data, pos), bpm: f32(data, pos + 4) });
  return out;
}
export function encodeBeatgrid(firstBeatSec, bpm) {
  const out = new Uint8Array(15), dv = new DataView(out.buffer);
  dv.setUint32(2, 1); dv.setFloat32(6, firstBeatSec); dv.setFloat32(10, bpm);
  return out;
}

// Rekordbox cues/beatgrid -> Serato hot-cue list + grid.
const HOT_COLORS = ['cc0000', 'cc8800', 'cccc00', '00cc00', '00cccc', '0000cc', '8800cc', 'cc0088'];
export function rbToSerato(anlz, fallbackBpm) {
  const cues = [], used = new Set();
  for (const c of anlz.cues.filter((c) => c.hot > 0).sort((a, b) => a.hot - b.hot))
    if (c.hot <= 8) { cues.push({ index: c.hot - 1, ms: c.ms, color: HOT_COLORS[c.hot - 1], name: '' }); used.add(c.hot - 1); }
  // memory cues fill whichever of the 8 hot-cue slots are still free
  for (const c of anlz.cues.filter((c) => c.hot === 0).sort((a, b) => a.ms - b.ms)) {
    const free = [0, 1, 2, 3, 4, 5, 6, 7].find((i) => !used.has(i));
    if (free === undefined) break;
    used.add(free); cues.push({ index: free, ms: c.ms, color: HOT_COLORS[free], name: '' });
  }
  cues.sort((a, b) => a.index - b.index);
  const b = anlz.beats[0];
  const grid = b ? [b.ms / 1000, b.bpm || fallbackBpm] : null;
  return { cues, grid };
}
