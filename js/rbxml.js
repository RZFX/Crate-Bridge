// Writes a rekordbox XML collection (tracks with cues + beatgrid, and playlists).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kindOf = (p) => ({ mp3: 'MP3 File', wav: 'WAV File', flac: 'FLAC File', aif: 'AIFF File', aiff: 'AIFF File', m4a: 'M4A File' }[(p.split('.').pop() || '').toLowerCase()] || 'Audio File');
export const parseLength = (s) => { const m = (s || '').split(':').map(Number); return m.some(isNaN) ? 0 : Math.round(m.reduce((a, v) => a * 60 + v, 0)); };
const location = (p) => 'file://localhost' + p.split('/').map(encodeURIComponent).join('/');

// tracks: [{id,path,title,artist,album,genre,bpm,key,length,size,cues,grid}] ; playlists: [{path:'A/B', ids:[...]}]
export function buildRekordboxXml(tracks, playlists) {
  const o = ['<?xml version="1.0" encoding="UTF-8"?>', '<DJ_PLAYLISTS Version="1.0.0">',
    '<PRODUCT Name="rekordbox" Version="6.0.0" Company="Pioneer DJ"/>', `<COLLECTION Entries="${tracks.length}">`];
  for (const t of tracks) {
    const bpm = t.grid?.length ? t.grid[t.grid.length - 1].bpm : parseFloat(t.bpm) || 0;
    o.push(`<TRACK TrackID="${t.id}" Name="${esc(t.title)}" Artist="${esc(t.artist)}" Album="${esc(t.album)}" Genre="${esc(t.genre)}" Kind="${kindOf(t.path)}" Size="${t.size || 0}" TotalTime="${t.seconds || 0}" AverageBpm="${(bpm || 0).toFixed(2)}" Tonality="${esc(t.key)}" Location="${esc(location(t.path))}">`);
    if (t.grid?.length && t.grid[t.grid.length - 1].bpm) o.push(`<TEMPO Inizio="${t.grid[0].pos.toFixed(3)}" Bpm="${t.grid[t.grid.length - 1].bpm.toFixed(2)}" Metro="4/4" Battito="1"/>`);
    for (const c of t.cues || []) {
      const rgb = c.color ? [parseInt(c.color.slice(0, 2), 16), parseInt(c.color.slice(2, 4), 16), parseInt(c.color.slice(4, 6), 16)] : null;
      o.push(`<POSITION_MARK Name="${esc(c.name)}" Type="0" Start="${(c.ms / 1000).toFixed(3)}" Num="${c.index}"${rgb ? ` Red="${rgb[0]}" Green="${rgb[1]}" Blue="${rgb[2]}"` : ''}/>`);
    }
    o.push('</TRACK>');
  }
  o.push('</COLLECTION>');
  // nested folders from "A/B" paths
  const root = { kids: new Map(), ids: [] };
  for (const p of playlists) {
    let n = root;
    for (const part of p.path.split('/')) { if (!n.kids.has(part)) n.kids.set(part, { kids: new Map(), ids: [] }); n = n.kids.get(part); }
    n.ids = p.ids;
  }
  const emit = (name, n) => {
    if (!n.kids.size) return [`<NODE Name="${esc(name)}" Type="1" KeyType="0" Entries="${n.ids.length}">`, ...n.ids.map((i) => `<TRACK Key="${i}"/>`), '</NODE>'];
    const out = [`<NODE Name="${esc(name)}" Type="0" Count="${n.kids.size + (n.ids.length ? 1 : 0)}">`];
    if (n.ids.length) out.push(...emit(`(tracks) ${name}`, { kids: new Map(), ids: n.ids }));
    for (const [k, v] of n.kids) out.push(...emit(k, v));
    return [...out, '</NODE>'];
  };
  o.push('<PLAYLISTS>', ...emit('ROOT', root), '</PLAYLISTS>', '</DJ_PLAYLISTS>');
  return o.join('\n');
}
