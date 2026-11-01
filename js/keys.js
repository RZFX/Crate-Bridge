// Musical key notation: Camelot <-> Open Key <-> standard.
const MINOR = ['Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'Dbm'];
const MAJOR = ['B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E'];
const ENH = { 'C#': 'Db', 'D#': 'Eb', 'Gb': 'F#', 'G#': 'Ab', 'A#': 'Bb', 'Cb': 'B', 'E#': 'F', 'B#': 'C', 'Fb': 'E' };

// -> {n: 1..12, minor: bool} or null
export function parseKey(s) {
  s = (s || '').trim();
  let m;
  if ((m = /^(\d{1,2})\s*([ABab])$/.exec(s)) && +m[1] >= 1 && +m[1] <= 12) return { n: +m[1], minor: m[2].toUpperCase() === 'A' };
  if ((m = /^(\d{1,2})\s*([dDmM])$/.exec(s)) && +m[1] >= 1 && +m[1] <= 12) return { n: ((((+m[1] - 5) % 12) + 12) % 12) || 12, minor: m[2].toLowerCase() === 'm' };
  if ((m = /^([A-Ga-g][#b♯♭]?)\s*(m|min|minor|maj|major|M)?$/.exec(s))) {
    let note = m[1][0].toUpperCase() + m[1].slice(1).replace('♯', '#').replace('♭', 'b');
    note = ENH[note] || note;
    const minor = ['m', 'min', 'minor'].includes(m[2] || '');
    const i = (minor ? MINOR : MAJOR).indexOf(note + (minor ? 'm' : ''));
    if (i >= 0) return { n: i + 1, minor };
  }
  return null;
}

export function convertKey(s) {
  const k = parseKey(s);
  if (!k) return null;
  return { camelot: `${k.n}${k.minor ? 'A' : 'B'}`, openkey: `${((k.n + 4) % 12) + 1}${k.minor ? 'm' : 'd'}`,
    standard: (k.minor ? MINOR : MAJOR)[k.n - 1] };
}
