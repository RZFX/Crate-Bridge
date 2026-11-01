// Copies Rekordbox playlists into plain folders, optionally embedding cues + writing Serato crates.
import { nodePath } from './rbpdb.js';
import { parseAnlz } from './anlz.js';
import { crateBytes, encodeMarkers2, encodeBeatgrid, rbToSerato } from './serato.js';
import { canEmbed, writeWithGeobs } from './id3.js';
import { getFileHandle, getDirHandle, writeText, requestWrite } from './fsx.js';

const BAD = /[<>:"/\\|?*\x00-\x1f]/g;
export const clean = (s, fb = 'untitled') => (s.replace(BAD, '_').normalize('NFC').trim().replace(/\.+$/, '').slice(0, 120) || fb);

export async function runRestore({ usbRoot, tracks, nodes, ids, opts, destRoot, roots, seratoDir, onProgress, signal }) {
  const stat = { done: 0, total: 0, files: 0, skipped: 0, embedded: 0, current: '', errors: [], missing: [], playlistsDone: 0 };
  const emit = () => onProgress({ ...stat });
  const plan = [];
  for (const id of ids) {
    const n = nodes.get(id);
    if (!n || n.folder) continue;
    const parts = (opts.keepTree ? nodePath(nodes, n) : [n.name]).map((p) => clean(p));
    plan.push({ n, parts });
    stat.total += n.tracks.length;
  }
  const crates = new Map(); // crate name -> abs paths
  const base = (opts.absBase || '').replace(/\/+$/, '');

  for (const { n, parts } of plan) {
    if (signal.aborted) break;
    const dir = opts.dryRun ? null : await getDirHandle(destRoot, parts.join('/'), true);
    const used = new Set(), m3u = [], abs = [];
    for (let i = 0; i < n.tracks.length; i++) {
      if (signal.aborted) break;
      const t = tracks.get(n.tracks[i]);
      stat.done++;
      if (!t) { stat.errors.push(`${n.name}: unknown track id ${n.tracks[i]}`); continue; }
      let h = await getFileHandle(usbRoot, t.path);
      if (!h && roots) h = await roots.findByName(t.filename || t.path.split('/').pop(), t.size);
      if (!h) { stat.missing.push(`${n.name}: ${t.path}`); continue; }
      const src = await h.getFile();
      let name = clean(t.filename || src.name);
      if (opts.number) name = `${String(i + 1).padStart(3, '0')} - ${name}`;
      const dot = name.lastIndexOf('.'), stemN = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
      for (let k = 2; used.has(name.toLowerCase()); k++) name = `${stemN} (${k})${ext}`;
      used.add(name.toLowerCase());
      stat.current = `${n.name} / ${name}`; emit();
      try {
        if (!opts.dryRun) {
          let exists = null;
          try { exists = await (await dir.getFileHandle(name)).getFile(); } catch { /* new file */ }
          if (exists && exists.size >= src.size) stat.skipped++;
          else {
            const fh = await dir.getFileHandle(name, { create: true });
            const w = await fh.createWritable();
            let embedded = false;
            try {
              if (opts.embed && t.anlz && canEmbed(src.name)) {
                const ah = await getFileHandle(usbRoot, t.anlz);
                if (ah) {
                  const { cues, grid } = rbToSerato(parseAnlz(await (await ah.getFile()).arrayBuffer()), t.bpm);
                  const geobs = {};
                  if (cues.length) geobs['Serato Markers2'] = encodeMarkers2(cues);
                  if (grid) geobs['Serato BeatGrid'] = encodeBeatgrid(...grid);
                  if (Object.keys(geobs).length) embedded = await writeWithGeobs(src, w, geobs);
                }
              }
              if (!embedded) await src.stream().pipeTo(w, { preventClose: true });
              await w.close();
            } catch (e) { try { await w.abort(); } catch { /* already closed */ } throw e; }
            if (embedded) stat.embedded++;
            stat.files++;
          }
        } else stat.files++;
        m3u.push([name, t]);
        abs.push(`${base}/${parts.join('/')}/${name}`);
      } catch (e) { stat.errors.push(`${n.name} / ${name}: ${e.message}`); }
    }
    if (!opts.dryRun && opts.m3u && m3u.length)
      await writeText(dir, clean(n.name) + '.m3u8', '#EXTM3U\n' + m3u.map(([f, t]) => `#EXTINF:-1,${t.artist} - ${t.title}\n${f}`).join('\n') + '\n');
    if (abs.length) crates.set((opts.crateParent ? [clean(opts.crateParent), ...parts] : parts).join('%%'), abs);
    stat.playlistsDone++; emit();
  }

  if (!opts.dryRun && opts.crates && base && crates.size) {
    let out, label;
    if (seratoDir && await requestWrite(seratoDir)) { out = await getDirHandle(seratoDir, 'Subcrates', true); label = 'Serato library'; }
    else { out = await getDirHandle(destRoot, '_Serato_Subcrates', true); label = '_Serato_Subcrates folder in the destination'; }
    for (const [name, paths] of crates) {
      let fn = name;
      try { await out.getFileHandle(fn + '.crate'); fn = name + ' (Rekordbox)'; } catch { /* free name */ }
      const fh = await out.getFileHandle(fn + '.crate', { create: true });
      const w = await fh.createWritable(); await w.write(crateBytes(paths)); await w.close();
    }
    stat.crateNote = `${crates.size} crates written to ${label}`;
  }
  if (!opts.dryRun && stat.missing.length) await writeText(destRoot, '_missing_tracks.txt', stat.missing.join('\n') + '\n');
  stat.finished = true; stat.cancelled = signal.aborted; emit();
  return stat;
}
