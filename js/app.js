import * as fsx from './fsx.js';
import { parsePdb } from './rbpdb.js';
import { readDatabase, readCrate, decodeMarkers2, decodeBeatgrid } from './serato.js';
import { readFileId3, getGeob } from './id3.js';
import { convertKey } from './keys.js';
import { diffLibraries, findDuplicates, baseName } from './match.js';
import { buildRekordboxXml, parseLength } from './rbxml.js';
import { runRestore } from './restore.js';
import { esc, fmt } from './util.js';

const $ = (id) => document.getElementById(id);
const st = { usb: null, se: null, roots: new fsx.Roots(), rbSize: null, csv: {}, abort: null };
const name = (t) => `${t.artist ? t.artist + ' – ' : ''}${t.title || t.filename || baseName(t.path)}`;

// highlight the visitor's browser in the support strip
{
  const ua = navigator.userAgent;
  const me = navigator.brave ? 'brave' : /Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Firefox\//.test(ua) ? 'firefox'
    : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : '';
  const li = document.querySelector(`#support [data-b="${me}"]`);
  if (li) {
    li.classList.add('me');
    // Brave ships the folder API switched off; once the flag is on the browser simply works
    if (li.classList.contains('flag') && fsx.supported) { li.classList.replace('flag', 'ok'); li.querySelector('small')?.remove(); }
  }
}

if (!fsx.supported) {
  $('unsupported').classList.remove('hide');
  document.querySelectorAll('.sources button').forEach((b) => (b.disabled = true));
}
const fail = (e) => { if (e?.name !== 'AbortError') $('srcErr').textContent = e.message || String(e); };

// ---------- tabs ----------
const setMenu = (open) => {
  const was = $('overlay').classList.contains('open');
  if (open === was) return;
  ['main', 'header', 'footer'].forEach((s) => document.querySelector(s).toggleAttribute('inert', open));
  $('overlay').classList.toggle('open', open);
  $('burger').classList.toggle('open', open);
  $('burger').setAttribute('aria-expanded', open);
  $('overlay').setAttribute('aria-hidden', !open);
  document.body.classList.toggle('noscroll', open);
  if (open) setTimeout(() => $('overlay').querySelector('a').focus(), 60);
  else if (was) $('burger').focus();
};
matchMedia('(min-width: 769px)').addEventListener('change', (e) => e.matches && setMenu(false));
$('burger').onclick = () => setMenu(!$('overlay').classList.contains('open'));
document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]')?.dataset.tab;
  if (!t || e.target.closest('[data-csv]')) return;
  document.querySelectorAll('[data-tab]').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === t);
    if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('hide', s.id !== 'tab-' + t));
});
$('overlay').addEventListener('click', (e) => e.target.closest('a') && setMenu(false));

// scroll-linked entrance: soft rise + de-blur once, via IntersectionObserver
{
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = !calm && 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.06, rootMargin: '0px 0px -5% 0px' })
    : null;
  document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
}

// ---------- CSV ----------
function setRows(id, header, rows) { st.csv[id] = [header, ...rows]; }
document.addEventListener('click', (e) => {
  const id = e.target.dataset?.csv; if (!id || !st.csv[id]) return;
  const body = st.csv[id].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  download(new Blob([body], { type: 'text/csv' }), id + '.csv');
});
function download(blob, fn) { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fn }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
const rowsHtml = (items, empty) => items.length ? items.join('') : `<div class="empty">${empty}</div>`;

// ---------- sources ----------
$('pickUsb').onclick = async () => {
  $('srcErr').textContent = '';
  try {
    const h = await fsx.pickDir();
    const f = await fsx.getFileHandle(h, 'PIONEER/rekordbox/export.pdb');
    if (!f) throw new Error('No PIONEER/rekordbox/export.pdb in that folder — choose the USB root.');
    const { tracks, nodes } = parsePdb(await (await f.getFile()).arrayBuffer());
    st.usb = { handle: h, tracks, nodes }; st.rbSize = null;
    const pl = [...nodes.values()].filter((n) => !n.folder);
    $('usbInfo').textContent = `${h.name}: ${tracks.size} tracks, ${pl.length} playlists`;
    renderPlaylists(); statTracks();
  } catch (e) { fail(e); }
};

async function statTracks() {
  const ids = [...st.usb.tracks.keys()], size = new Map(); let i = 0, done = 0;
  const usb = st.usb;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < ids.length && st.usb === usb) {
      const t = usb.tracks.get(ids[i++]);
      const h = await fsx.getFileHandle(usb.handle, t.path);
      size.set(t.id, h ? (await h.getFile()).size : null);
      if (++done % 100 === 0) $('statProg').textContent = `Checking files… ${done}/${ids.length}`;
    }
  }));
  if (st.usb !== usb) return;
  st.rbSize = size; $('statProg').textContent = '';
  updateMeta();
}

$('pickSerato').onclick = async () => {
  $('srcErr').textContent = '';
  try {
    const h = await fsx.pickDir();
    const dbh = await fsx.getFileHandle(h, 'database V2');
    if (!dbh) throw new Error("No 'database V2' in that folder — choose the _Serato_ folder.");
    const tracks = readDatabase(await (await dbh.getFile()).arrayBuffer());
    const crates = new Map();
    try {
      const sc = await h.getDirectoryHandle('Subcrates');
      for await (const [fn, fh] of sc.entries()) if (fn.endsWith('.crate'))
        crates.set(fn.slice(0, -6).replace(/%%/g, '/'), readCrate(await (await fh.getFile()).arrayBuffer()));
    } catch { /* no crates */ }
    st.se = { handle: h, tracks, crates };
    $('seInfo').textContent = `${tracks.length} tracks, ${crates.size} crates`;
    const home = tracks[0]?.path.match(/^\/Users\/[^/]+/)?.[0];
    if (home) $('oAbs').placeholder = `Absolute path of the destination, e.g. ${home}/Music/Restored`;
    renderXmlList();
  } catch (e) { fail(e); }
};

$('addRoot').onclick = async () => {
  try {
    const h = await fsx.pickDir();
    $('rootsInfo').textContent = `Indexing ${h.name}…`;
    await st.roots.add(h);
    $('rootsInfo').textContent = `${st.roots.dirs.map((d) => d.name).join(', ')} — ${st.roots.indexed} files`;
  } catch (e) { fail(e); $('rootsInfo').textContent = 'Folders with your audio files.'; }
};

// ---------- restore ----------
let destHandle = null;
function renderPlaylists() {
  const nodes = [...st.usb.nodes.values()], by = {};
  nodes.forEach((n) => (by[n.parent] ||= []).push(n));
  const out = [];
  (function walkTree(p, d) {
    (by[p] || []).sort((a, b) => a.sort - b.sort).forEach((n) => {
      const pad = `data-depth="${d}"`;
      out.push(n.folder ? `<div class="fold" ${pad} data-name="${esc(n.name.toLowerCase())}">📁 ${esc(n.name)}</div>`
        : `<label ${pad} data-name="${esc(n.name.toLowerCase())}"><input type="checkbox" data-id="${n.id}" checked><span class="n">${esc(n.name)}</span><span class="m" id="m${n.id}">${n.tracks.length} tracks</span></label>`);
      if (n.folder) walkTree(n.id, d + 1);
    });
  })(0, 0);
  $('plList').innerHTML = out.join('');
  $('plList').querySelectorAll('[data-depth]').forEach((el) => { el.style.paddingLeft = `${10 + el.dataset.depth * 20}px`; });
  sumSel();
}
function updateMeta() {
  for (const n of st.usb.nodes.values()) {
    if (n.folder) continue;
    let size = 0, miss = 0;
    for (const id of n.tracks) { const s = st.rbSize.get(id); if (s == null) miss++; else size += s; }
    const el = $('m' + n.id);
    if (el) el.innerHTML = `${n.tracks.length} tracks · ${fmt(size)}${miss ? ` · <span class="bad">${miss} missing</span>` : ''}`;
  }
  sumSel();
}
const checks = () => [...document.querySelectorAll('#plList input')];
function sumSel() {
  const sel = checks().filter((c) => c.checked), n = sel.reduce((a, c) => a + st.usb.nodes.get(+c.dataset.id).tracks.length, 0);
  $('plSel').textContent = `${sel.length} selected`;
  $('summary').textContent = `${n} tracks`;
}
$('plList').onchange = sumSel;
$('plAll').onclick = () => { checks().forEach((c) => (c.checked = true)); sumSel(); };
$('plNone').onclick = () => { checks().forEach((c) => (c.checked = false)); sumSel(); };
$('plFilter').oninput = (e) => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#plList>*').forEach((l) => (l.style.display = l.dataset.name.includes(q) ? '' : 'none')); };
$('pickDest').onclick = async () => { try { destHandle = await fsx.pickDir('readwrite'); $('destName').textContent = destHandle.name; } catch (e) { fail(e); } };

$('go').onclick = async () => {
  if (!st.usb) return alert('Choose the Rekordbox USB first');
  if (!destHandle) return alert('Choose a destination folder');
  const ids = checks().filter((c) => c.checked).map((c) => +c.dataset.id);
  if (!ids.length) return alert('Select at least one playlist');
  const opts = { keepTree: $('oTree').checked, number: $('oNum').checked, m3u: $('oM3u').checked, embed: $('oEmbed').checked,
    dryRun: $('oDry').checked, absBase: $('oAbs').value.trim(), crates: !!$('oAbs').value.trim(), crateParent: $('oParent').value.trim() };
  st.abort = new AbortController();
  $('prog').classList.remove('hide'); $('after').classList.add('hide');
  $('go').disabled = true; $('cancel').classList.remove('hide');
  try {
    const r = await runRestore({ usbRoot: st.usb.handle, tracks: st.usb.tracks, nodes: st.usb.nodes, ids, opts, destRoot: destHandle,
      roots: $('oSearch').checked && st.roots.indexed ? st.roots : null, seratoDir: st.se?.handle, signal: st.abort.signal,
      onProgress: (s) => {
        const frac = s.total ? s.done / s.total : 1;
        $('barfill').style.transform = `scaleX(${frac})`;
        $('bar').setAttribute('aria-valuenow', Math.round(frac * 100));
        if (s.finished) $('announce').textContent = `${s.cancelled ? 'Cancelled' : 'Finished'}: ${s.files} copied, ${s.skipped} already there, ${s.missing.length} missing, ${s.errors.length} errors.`;
        $('ptext').textContent = `${s.finished ? (s.cancelled ? 'Cancelled' : 'Done') : 'Working'} · ${s.done}/${s.total} tracks · ${s.files} copied (${s.embedded} with cues/grid), ${s.skipped} already there, ${s.missing.length} missing · playlist ${s.playlistsDone}/${ids.length}${s.finished ? '' : '\n' + s.current}${s.crateNote ? '\n' + s.crateNote : ''}`;
        $('perr').textContent = [...s.errors, ...(s.missing.length ? [`${s.missing.length} files not found on the USB (list saved as _missing_tracks.txt):`, ...s.missing.slice(0, 20)] : [])].join('\n');
      } });
    if (!opts.dryRun && !r.cancelled) $('after').classList.remove('hide');
  } catch (e) { $('perr').textContent += '\n' + (e.message || e); }
  $('go').disabled = false; $('cancel').classList.add('hide');
};
$('cancel').onclick = () => st.abort?.abort();

// ---------- diff ----------
$('diffGo').onclick = () => {
  if (!st.usb || !st.se) return alert('Choose both the Rekordbox USB and the Serato library first');
  const d = diffLibraries([...st.usb.tracks.values()], st.se.tracks);
  $('diffSum').textContent = `${d.both} in both · ${d.onlyRb.length} only in Rekordbox · ${d.onlySe.length} only in Serato`;
  const show = (id, arr) => { $(id).innerHTML = rowsHtml(arr.map((t) => `<div><span class="n">${esc(name(t))}</span><span class="m">${esc(baseName(t.path))}</span></div>`), 'Nothing'); setRows(id, ['track', 'path'], arr.map((t) => [name(t), t.path])); };
  show('diffRb', d.onlyRb); show('diffSe', d.onlySe);
};

// ---------- Serato -> Rekordbox ----------
function renderXmlList() {
  $('xmlList').innerHTML = rowsHtml([...st.se.crates].sort().map(([n, p]) => `<label><input type="checkbox" data-crate="${esc(n)}" checked><span class="n">${esc(n)}</span><span class="m">${p.length} tracks</span></label>`), 'No crates found');
  xmlSel();
}
const xmlBoxes = () => [...document.querySelectorAll('#xmlList input')];
const xmlSel = () => ($('xmlSel').textContent = `${xmlBoxes().filter((c) => c.checked).length} selected`);
$('xmlList').onchange = xmlSel;
$('xmlAll').onclick = () => { xmlBoxes().forEach((c) => (c.checked = true)); xmlSel(); };
$('xmlNone').onclick = () => { xmlBoxes().forEach((c) => (c.checked = false)); xmlSel(); };
$('xmlGo').onclick = async () => {
  if (!st.se) return alert('Choose the Serato library first');
  const sel = xmlBoxes().filter((c) => c.checked).map((c) => c.dataset.crate);
  if (!sel.length) return alert('Select at least one crate');
  $('xmlGo').disabled = true; $('xmlErr').textContent = '';
  const byPath = new Map(st.se.tracks.map((t) => [t.path, t]));
  const paths = [...new Set(sel.flatMap((c) => st.se.crates.get(c)))];
  const idOf = new Map(), tracks = []; let unread = 0, i = 0;
  for (const p of paths) {
    $('xmlProg').textContent = `Reading ${++i}/${paths.length}…`;
    const base = byPath.get(p) || { path: p, title: baseName(p).replace(/\.[^.]+$/, '') };
    const t = { ...base, id: tracks.length + 1, seconds: parseLength(base.length), cues: [], grid: [] };
    if ($('xCues').checked) {
      const h = await st.roots.resolve(p);
      if (h) {
        const f = await h.getFile(); t.size = f.size;
        try {
          const id3 = await readFileId3(f);
          if (id3?.frames) {
            t.cues = decodeMarkers2(getGeob(id3.frames, 'Serato Markers2'));
            t.grid = decodeBeatgrid(getGeob(id3.frames, 'Serato BeatGrid'));
          }
        } catch { /* unreadable tag: export track without cues */ }
      } else unread++;
    }
    idOf.set(p, t.id); tracks.push(t);
  }
  const xml = buildRekordboxXml(tracks, sel.map((c) => ({ path: c, ids: [...new Set(st.se.crates.get(c).map((p) => idOf.get(p)))] })));
  download(new Blob([xml], { type: 'application/xml' }), 'rekordbox.xml');
  $('xmlProg').textContent = `Exported ${tracks.length} tracks in ${sel.length} playlists.`;
  if (unread) $('xmlErr').textContent = `${unread} audio files weren't reachable through your Music folders, so those tracks have no cues/beatgrid.`;
  $('xmlGo').disabled = false;
};

// ---------- duplicates ----------
const libOf = (s) => (s === 'rb' ? [...(st.usb?.tracks.values() || [])] : st.se?.tracks || []);
$('dupGo').onclick = () => {
  const src = $('dupSrc').value, lib = libOf(src);
  if (!lib.length) return alert('Choose that library first');
  const g = findDuplicates(lib);
  $('dupSum').textContent = `${g.length} groups`;
  $('dupList').innerHTML = rowsHtml(g.map((grp) => `<div class="grp"><b>${esc(name(grp[0]))}</b>${grp.map((t) => `<div>${esc(t.path)}${t.size && src === 'rb' ? ' · ' + fmt(t.size) : ''}</div>`).join('')}</div>`), 'No duplicates found');
};

// ---------- missing files ----------
$('relGo').onclick = async () => {
  const src = $('relSrc').value, lib = libOf(src);
  if (!lib.length) return alert('Choose that library first');
  if (src === 'se' && !st.roots.dirs.length) return alert('Add the folders holding your music first, so missing files can be detected');
  $('relSum').textContent = 'Checking…';
  const rows = [];
  for (const t of lib) {
    let exists;
    if (src === 'rb') { if (!st.rbSize) await statTracks(); exists = st.rbSize.get(t.id) != null; }
    else exists = !!(await st.roots.resolve(t.path));
    if (exists) continue;
    const f = await st.roots.findEntry(t.filename || baseName(t.path), src === 'rb' ? t.size : 0);
    rows.push({ t, f });
  }
  const found = rows.filter((r) => r.f).length;
  $('relSum').textContent = `${rows.length} missing · ${found} can be found in your Music folders`;
  $('relList').innerHTML = rowsHtml(rows.map(({ t, f }) => `<div><span class="n">${esc(name(t))}</span><span class="m ${f ? 'ok' : 'bad'}">${f ? esc(f.root + '/' + f.path) : 'not found'}</span></div>`), 'Nothing is missing 🎉');
  setRows('relList', ['track', 'original path', 'found at'], rows.map(({ t, f }) => [name(t), t.path, f ? f.root + '/' + f.path : '']));
};

// ---------- keys ----------
$('keyIn').oninput = (e) => { const c = convertKey(e.target.value); $('keyOut').textContent = c ? `Camelot ${c.camelot} · Open Key ${c.openkey} · ${c.standard}` : e.target.value ? 'unrecognised' : ''; };
function renderKeys() {
  const lib = libOf($('keySrc').value), q = $('keyFilter').value.toLowerCase();
  const rows = lib.map((t) => ({ t, c: convertKey(t.key) })).filter(({ t }) => !q || name(t).toLowerCase().includes(q));
  $('keyList').innerHTML = rowsHtml(rows.slice(0, 1000).map(({ t, c }) => `<div><span class="n">${esc(name(t))}</span><span class="m">${esc(t.key || '—')}${c ? ` · ${c.camelot} · ${c.openkey}` : ''}</span></div>`), 'Choose a library first');
  setRows('keyList', ['track', 'key', 'camelot', 'openkey'], rows.map(({ t, c }) => [name(t), t.key, c?.camelot, c?.openkey]));
}
$('keySrc').onchange = $('keyFilter').oninput = renderKeys;
document.querySelector('[data-tab=keys]').addEventListener('click', renderKeys);
