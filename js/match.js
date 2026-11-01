// Fuzzy track identity: used for library diff and duplicate detection.
export const norm = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const baseName = (p) => p.split('/').pop();
export const stem = (n) => n.replace(/\.[A-Za-z0-9]{2,5}$/, '');

export function trackKeys(t) {
  const keys = new Set();
  const s = norm(stem(t.filename || baseName(t.path)));
  if (s) keys.add('f:' + s);
  if (t.artist && t.title) keys.add('t:' + norm(t.artist + t.title));
  if (norm(t.title).length >= 8) keys.add('n:' + norm(t.title));
  return keys;
}

export function diffLibraries(rb, se) {
  const idx = new Map();
  se.forEach((t, i) => { for (const k of trackKeys(t)) { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(i); } });
  const seHit = new Set(), onlyRb = [];
  for (const t of rb) {
    let hit = false;
    for (const k of trackKeys(t)) for (const i of idx.get(k) || []) { seHit.add(i); hit = true; }
    if (!hit) onlyRb.push(t);
  }
  return { onlyRb, onlySe: se.filter((_, i) => !seHit.has(i)), both: rb.length - onlyRb.length };
}

const copyMark = /(\s*\(\d+\)|\s*copy|[-_]\d)$/i;
export function findDuplicates(tracks) {
  const groups = new Map();
  for (const t of tracks) {
    const base = t.artist && t.title ? t.artist + t.title : stem(t.filename || baseName(t.path)).replace(copyMark, '');
    const k = norm(base);
    if (k.length < 4) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  return [...groups.values()].filter((g) => new Set(g.map((t) => t.path)).size > 1);
}
