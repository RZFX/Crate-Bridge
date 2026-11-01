// Rekordbox ANLZ analysis files: beatgrid (PQTZ) and cue points (PCOB).
export function parseAnlz(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const beats = [], cues = [];
  let pos = dv.getUint32(4);
  const tag = (p) => String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
  while (pos + 12 <= u8.length) {
    const hl = dv.getUint32(pos + 4), tl = dv.getUint32(pos + 8);
    if (!tl) break;
    const t = tag(pos);
    if (t === 'PQTZ') {
      const n = dv.getUint32(pos + 20);
      for (let i = 0; i < n; i++) {
        const o = pos + hl + i * 8;
        beats.push({ num: dv.getUint16(o), bpm: dv.getUint16(o + 2) / 100, ms: dv.getUint32(o + 4) });
      }
    } else if (t === 'PCOB') {
      const n = dv.getUint16(pos + 18);
      let p = pos + hl;
      for (let i = 0; i < n && tag(p) === 'PCPT'; i++) {
        const ptl = dv.getUint32(p + 8);
        if (dv.getUint32(p + 16)) cues.push({ hot: dv.getUint32(p + 12), ms: dv.getUint32(p + 32),
          loopMs: u8[p + 28] === 2 ? dv.getUint32(p + 36) : null });
        p += ptl;
      }
    }
    pos += tl;
  }
  return { beats, cues };
}
