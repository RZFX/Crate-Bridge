// node test/embed.test.mjs <audio file> <out file>
import fs from 'node:fs';
import { Writable } from 'node:stream';
import { writeWithGeobs, readFileId3, getGeob } from '../../js/id3.js';
import { encodeMarkers2, decodeMarkers2, encodeBeatgrid, decodeBeatgrid } from '../../js/serato.js';
const [src, out] = process.argv.slice(2);
const blob = await fs.openAsBlob(src); const file = Object.assign(blob, { name: src });
const cues = [{ index: 0, ms: 1234, color: 'cc0000', name: '' }, { index: 3, ms: 56789, color: '00cc00', name: 'drop' }];
const before = await readFileId3(file);
const ws = Writable.toWeb(fs.createWriteStream(out));
const ok = await writeWithGeobs(file, ws, { 'Serato Markers2': encodeMarkers2(cues), 'Serato BeatGrid': encodeBeatgrid(0.25, 174) });
await ws.close();
console.log('embedded', ok, 'had tag', !!before, 'frames before', before?.frames?.length);
const f2 = Object.assign(await fs.openAsBlob(out), { name: src });
const t = await readFileId3(f2);
console.log('cues', decodeMarkers2(getGeob(t.frames, 'Serato Markers2')), decodeBeatgrid(getGeob(t.frames, 'Serato BeatGrid')), 'frames after', t.frames.length);
