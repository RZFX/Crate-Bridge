// Minimal ID3v2 editing (GEOB frames) for MP3, and the ID3 chunk inside WAV / AIFF.
const lat1 = (u8, a, b) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(u8[i]); return s; };
const synch = (u8, o) => ((u8[o] & 127) << 21) | ((u8[o + 1] & 127) << 14) | ((u8[o + 2] & 127) << 7) | (u8[o + 3] & 127);
const unsynch = (n) => new Uint8Array([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
const be32 = (u8, o) => ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
const u32be = (n) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

// -> {major, frames:[{id,flags,body}], total} | null (no tag) | {unsupported:true}
export function parseId3(u8) {
  if (u8.length < 10 || lat1(u8, 0, 3) !== 'ID3') return null;
  const major = u8[3], flags = u8[5];
  if (major < 3 || major > 4 || (flags & 0x80)) return { unsupported: true };
  const size = synch(u8, 6), total = 10 + size + (flags & 0x10 ? 10 : 0);
  let pos = 10;
  if (flags & 0x40) pos += major === 4 ? synch(u8, 10) : 4 + be32(u8, 10);
  const end = Math.min(10 + size, u8.length), frames = [];
  while (pos + 10 <= end && u8[pos] !== 0) {
    const len = major === 4 ? synch(u8, pos + 4) : be32(u8, pos + 4);
    if (pos + 10 + len > end) break;
    frames.push({ id: lat1(u8, pos, pos + 4), flags: u8.slice(pos + 8, pos + 10), body: u8.slice(pos + 10, pos + 10 + len) });
    pos += 10 + len;
  }
  return { major, frames, total };
}

export function buildId3(frames, major = 3, padding = 512) {
  const parts = [];
  for (const f of frames) {
    parts.push(new TextEncoder().encode(f.id), major === 4 ? unsynch(f.body.length) : u32be(f.body.length), f.flags, f.body);
  }
  const size = parts.reduce((a, p) => a + p.length, 0) + padding;
  const out = new Uint8Array(10 + size);
  out.set([0x49, 0x44, 0x33, major, 0, 0]); out.set(unsynch(size), 6);
  let o = 10; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const geobDesc = (body) => {
  const enc = body[0], wide = enc === 1 || enc === 2;
  const term = (from) => { for (let i = from; i < body.length; i += wide ? 2 : 1) if (body[i] === 0 && (!wide || body[i + 1] === 0)) return i; return body.length; };
  const m = body.indexOf(0, 1), fe = term(m + 1), de = term(fe + (wide ? 2 : 1));
  const dstart = fe + (wide ? 2 : 1);
  const desc = wide ? new TextDecoder(enc === 1 ? 'utf-16' : 'utf-16be').decode(body.subarray(dstart, de)) : lat1(body, dstart, de);
  return { desc, data: body.subarray(de + (wide ? 2 : 1)) };
};

export const getGeob = (frames, desc) => {
  for (const f of frames) if (f.id === 'GEOB') { const g = geobDesc(f.body); if (g.desc === desc) return g.data; }
  return null;
};

export function setGeobs(frames, geobs) {
  const descs = new Set(Object.keys(geobs));
  const out = frames.filter((f) => !(f.id === 'GEOB' && descs.has(geobDesc(f.body).desc)));
  for (const [desc, data] of Object.entries(geobs)) {
    const head = new TextEncoder().encode('\0application/octet-stream\0\0' + desc + '\0');
    const body = new Uint8Array(head.length + data.length); body.set(head); body.set(data, head.length);
    out.push({ id: 'GEOB', flags: new Uint8Array(2), body });
  }
  return out;
}

const extOf = (name) => (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
export const canEmbed = (name) => ['mp3', 'wav', 'aif', 'aiff'].includes(extOf(name));

const readBytes = async (file, a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer());

// Locate the ID3 chunk of a RIFF/WAVE or FORM/AIFF file.
async function findChunk(file, le) {
  const head = await readBytes(file, 0, 12);
  let pos = 12;
  while (pos + 8 <= file.size) {
    const h = await readBytes(file, pos, pos + 8);
    const len = le ? (h[4] | h[5] << 8 | h[6] << 16 | h[7] << 24) >>> 0 : be32(h, 4);
    if (lat1(h, 0, 4).toLowerCase() === 'id3 ') return { head, start: pos, end: Math.min(file.size, pos + 8 + len + (len & 1)), len };
    pos += 8 + len + (len & 1);
  }
  return { head, start: file.size, end: file.size, len: 0 };
}

// Read the existing tag frames of a file (or null).
export async function readFileId3(file) {
  const ext = extOf(file.name);
  if (ext === 'mp3') {
    const h = await readBytes(file, 0, 10);
    if (lat1(h, 0, 3) !== 'ID3') return null;
    return parseId3(await readBytes(file, 0, 10 + synch(h, 6)));
  }
  if (ext === 'wav' || ext === 'aif' || ext === 'aiff') {
    const c = await findChunk(file, ext === 'wav');
    return c.len ? parseId3(await readBytes(file, c.start + 8, c.start + 8 + c.len)) : null;
  }
  return null;
}

// Stream `file` into `writable` with the given GEOB frames merged into its ID3 tag.
// Returns false (writing nothing) when the file can't be edited safely.
export async function writeWithGeobs(file, writable, geobs) {
  const ext = extOf(file.name);
  const pipe = (blob) => blob.stream().pipeTo(writable, { preventClose: true });
  const put = async (bytes) => { const w = writable.getWriter(); await w.write(bytes); w.releaseLock(); };
  const old = await readFileId3(file);
  if (old?.unsupported) return false;
  const frames = setGeobs(old?.frames || [], geobs);
  const tag = buildId3(frames, old?.major || 3);
  if (ext === 'mp3') {
    await put(tag);
    await pipe(file.slice(old ? old.total : 0));
    return true;
  }
  if (ext === 'wav' || ext === 'aif' || ext === 'aiff') {
    const le = ext === 'wav', c = await findChunk(file, le);
    const padded = tag.length + (tag.length & 1);
    const chunkLen = 8 + padded;
    const newSize = file.size - (c.end - c.start) + chunkLen;
    const head = c.head.slice();
    const riff = newSize - 8;
    if (le) head.set([riff & 255, (riff >> 8) & 255, (riff >> 16) & 255, (riff >>> 24) & 255], 4); else head.set(u32be(riff), 4);
    await put(head);
    await pipe(file.slice(12, c.start));
    await pipe(file.slice(c.end));
    const ck = new Uint8Array(chunkLen);
    ck.set(new TextEncoder().encode(le ? 'id3 ' : 'ID3 '));
    ck.set(le ? [padded & 255, (padded >> 8) & 255, (padded >> 16) & 255, (padded >>> 24) & 255] : u32be(padded), 4);
    ck.set(tag, 8);
    await put(ck);
    return true;
  }
  return false;
}
