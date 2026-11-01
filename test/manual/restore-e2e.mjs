// node test/restore.e2e.mjs <usb root> <dest dir> "<playlist name>"...
import fs from 'node:fs';
import { NodeDir } from './nodefs.mjs';
import { getFileHandle } from '../../js/fsx.js';
import { parsePdb } from '../../js/rbpdb.js';
import { runRestore } from '../../js/restore.js';
const [usbP, destP, ...names] = process.argv.slice(2);
fs.mkdirSync(destP, { recursive: true });
const usb = new NodeDir(usbP), dest = new NodeDir(destP);
const b = await (await (await getFileHandle(usb, 'PIONEER/rekordbox/export.pdb')).getFile()).arrayBuffer();
const { tracks, nodes } = parsePdb(b);
const ids = [...nodes.values()].filter((n) => names.includes(n.name)).map((n) => n.id);
const r = await runRestore({ usbRoot: usb, tracks, nodes, ids, destRoot: dest, roots: null, seratoDir: null, signal: new AbortController().signal,
  opts: { keepTree: true, number: false, m3u: true, embed: true, dryRun: false, absBase: '/Users/test/Music/Restored', crates: true, crateParent: 'Rekordbox' },
  onProgress: () => {} });
console.log({ ...r, missing: r.missing.length, errors: r.errors });
