// Reader for Rekordbox DeviceSQL export.pdb: tracks, playlists, keys, genres.
const T = { TRACKS: 0, GENRES: 1, ARTISTS: 2, KEYS: 5, TREE: 7, ENTRIES: 8 };

function readString(dv, u8, pos) {
  const f = u8[pos];
  if (f & 1) return latin1(u8, pos + 1, (f >> 1) - 1);
  if (f === 0x40) return latin1(u8, pos + 4, dv.getUint16(pos + 1, true) - 4);
  if (f === 0x90) {
    const n = dv.getUint16(pos + 1, true) - 4;
    return new TextDecoder('utf-16le').decode(u8.subarray(pos + 4, pos + 4 + n)).replace(/\0+$/, '');
  }
  return '';
}
const latin1 = (u8, p, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[p + i]); return s; };

export function parsePdb(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  const pageLen = dv.getUint32(4, true), nTables = dv.getUint32(8, true);
  const tables = {};
  for (let t = 0; t < nTables; t++) {
    const o = 28 + t * 16;
    tables[dv.getUint32(o, true)] = [dv.getUint32(o + 8, true), dv.getUint32(o + 12, true)];
  }
  function* rows(type) {
    if (!tables[type]) return;
    const [first, last] = tables[type];
    const seen = new Set();
    let page = first;
    while (!seen.has(page)) {
      seen.add(page);
      const base = page * pageLen;
      if (base + pageLen > u8.length) break;
      if (!(u8[base + 0x1b] & 0x40)) {
        const n = (u8[base + 0x18] | u8[base + 0x19] << 8 | u8[base + 0x1a] << 16) & 0x1fff;
        for (let g = 0; g * 16 < n; g++) {
          const gend = base + pageLen - g * 0x24;
          const present = dv.getUint16(gend - 4, true);
          for (let i = 0; i < Math.min(16, n - g * 16); i++) {
            if (!((present >> i) & 1)) continue;
            yield base + 0x28 + dv.getUint16(gend - 6 - 2 * i, true);
          }
        }
      }
      if (page === last) break;
      page = dv.getUint32(base + 0x0c, true);
    }
  }
  const str = (p) => readString(dv, u8, p);
  const artists = new Map();
  for (const r of rows(T.ARTISTS)) {
    const sub = dv.getUint16(r, true);
    artists.set(dv.getUint32(r + 4, true), str(r + (sub & 4 ? dv.getUint16(r + 10, true) : u8[r + 9])));
  }
  const genres = new Map(), keys = new Map();
  for (const r of rows(T.GENRES)) genres.set(dv.getUint32(r, true), str(r + 4));
  for (const r of rows(T.KEYS)) keys.set(dv.getUint32(r, true), str(r + 8));

  const tracks = new Map();
  for (const r of rows(T.TRACKS)) {
    const o = []; for (let i = 0; i < 21; i++) o.push(dv.getUint16(r + 0x5e + i * 2, true));
    const id = dv.getUint32(r + 0x48, true);
    tracks.set(id, {
      id, title: str(r + o[17]), artist: artists.get(dv.getUint32(r + 0x44, true)) || '',
      filename: str(r + o[19]), path: str(r + o[20]), anlz: str(r + o[14]),
      size: dv.getUint32(r + 0x10, true), key: keys.get(dv.getUint32(r + 0x20, true)) || '',
      bpm: dv.getUint32(r + 0x38, true) / 100, genre: genres.get(dv.getUint32(r + 0x3c, true)) || '',
      duration: dv.getUint16(r + 0x54, true),
    });
  }
  const nodes = new Map();
  for (const r of rows(T.TREE)) {
    const id = dv.getUint32(r + 12, true);
    nodes.set(id, { id, parent: dv.getUint32(r, true), sort: dv.getUint32(r + 8, true),
      folder: !!dv.getUint32(r + 16, true), name: str(r + 20), tracks: [] });
  }
  const entries = [];
  for (const r of rows(T.ENTRIES)) entries.push([dv.getUint32(r + 8, true), dv.getUint32(r, true), dv.getUint32(r + 4, true)]);
  entries.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [pid, , tid] of entries) nodes.get(pid)?.tracks.push(tid);
  return { tracks, nodes };
}

// Path of folder/playlist names from the root down to node n.
export function nodePath(nodes, n) {
  const parts = [];
  while (n) { parts.unshift(n.name); n = nodes.get(n.parent); }
  return parts;
}
