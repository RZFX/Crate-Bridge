// Runs against a real export if given: node test/pdb.test.mjs /path/to/export.pdb
import fs from 'node:fs';
import { parsePdb } from '../../js/rbpdb.js';
import { parseAnlz } from '../../js/anlz.js';
const p = process.argv[2];
if (!p) { console.log('pdb: skipped (no path given)'); process.exit(0); }
const b = fs.readFileSync(p);
const { tracks, nodes } = parsePdb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const pls = [...nodes.values()].filter((n) => !n.folder);
console.log(tracks.size, 'tracks', pls.length, 'playlists', pls.reduce((a, n) => a + n.tracks.length, 0), 'entries', 'empty:', pls.filter((n) => !n.tracks.length).length);
const t = [...tracks.values()][5]; console.log(t);
