# Architecture

Crate Bridge is a static site: `index.html`, `css/style.css` and ES modules in `js/`. There is no build step, no
bundler and no runtime dependency. Everything runs in the page, using the browser's
[File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_API) to read and write the folders
the user picks.

```
index.html ── js/app.js ─┬─ js/fsx.js       folder handles, walking, name index (Roots)
                         ├─ js/rbpdb.js     Rekordbox export.pdb reader  ──┐
                         ├─ js/anlz.js      Rekordbox ANLZ (cues, grid)    ├─ Rekordbox side
                         ├─ js/serato.js    Serato db, crates, cue/grid tags ─ Serato side
                         ├─ js/id3.js       ID3v2 GEOB editing for MP3/WAV/AIFF
                         ├─ js/restore.js   the copy engine (also used by tests)
                         ├─ js/match.js     fuzzy identity: diff + duplicates
                         ├─ js/rbxml.js     rekordbox.xml writer
                         ├─ js/keys.js      Camelot / Open Key / standard
                         └─ js/util.js      esc(), fmt()
```

Only `app.js` touches the DOM. Every other module is plain data-in/data-out (or takes folder handles), which is why
the tests run under Node with a small file-system shim (`test/manual/nodefs.mjs`).

## Restore, step by step

1. `parsePdb` reads `PIONEER/rekordbox/export.pdb` into `tracks` and a playlist tree.
2. For each selected playlist `runRestore` creates the folder, then for each track:
   locate the audio file on the USB (or fall back to the user's music folders), copy it with
   `file.stream().pipeTo(writable)`, and — if enabled — read the track's ANLZ file, convert cues and
   beatgrid, and stream the audio through `writeWithGeobs` so the Serato tags land in the same write.
3. Optional `.m3u8` files and Serato `.crate` files are written at the end.

Files are written through the browser's swap-file mechanism, so a cancelled or failed copy never leaves a
half-written track. Existing files of the same name and at least the same size are skipped, which makes re-running
a restore cheap.

## File formats (reverse-engineered)

These formats are not officially documented. Credit goes to the people who analysed them publicly, notably
[Deep Symmetry's analysis of the Rekordbox export format](https://djl-analysis.deepsymmetry.org/) and Jan Holthuis'
[serato-tags](https://github.com/Holzhaus/serato-tags) notes. Corrections welcome.

### Rekordbox `export.pdb` (DeviceSQL)

- File header: page length at byte 4, table count at byte 8, then 16-byte table pointers from byte 28
  (`type, empty_candidate, first_page, last_page`).
- Pages are linked through `next_page` (offset `0x0C`). The number of rows is the low 13 bits of the 3-byte
  field at `0x18`; flag `0x40` at `0x1B` marks index pages (skipped).
- Rows are indexed from the end of the page in groups of 16 (`0x24` bytes each): reversed 16-bit offsets, then a
  presence bitmap. Offsets are relative to the page heap (`page + 0x28`).
- Strings: low bit set = short ASCII; `0x40` = long ASCII; `0x90` = UTF-16LE.
- Tables used: `0` tracks, `1` genres, `2` artists, `5` keys, `7` playlist tree, `8` playlist entries.
  Track rows carry 21 string offsets from `0x5E` (title = 17, analyze path = 14, filename = 19, path = 20).

### Rekordbox ANLZ (`ANLZ0000.DAT`)

Big-endian tag stream. `PQTZ` holds the beatgrid (8 bytes per beat: beat number, tempo×100, time in ms); `PCOB`
holds cue lists made of `PCPT` entries (hot-cue number, status, type, time, loop end).

### Serato

- `database V2` and `Subcrates/*.crate`: a stream of `4-char tag, u32 length, payload`. Text/paths are UTF-16BE,
  paths have no leading slash. Hierarchy is encoded in the file name (`Parent%%Child.crate`).
- Per-file tags are ID3 `GEOB` frames: `Serato Markers2` (base64 inside, padded to 470 bytes, entries `COLOR`,
  `CUE`, `BPMLOCK`) and `Serato BeatGrid` (first-beat position and BPM as big-endian floats).
- In WAV/AIFF files the ID3 tag lives in an `id3 ` / `ID3 ` chunk; `writeWithGeobs` rewrites the chunk list and
  fixes the RIFF/FORM size while streaming.

### rekordbox.xml

`COLLECTION` of `TRACK` elements (with `TEMPO` and `POSITION_MARK` children) plus a `PLAYLISTS` node tree. A Serato
crate that holds both tracks and sub-crates becomes a folder plus a "(tracks) Name" playlist, because Rekordbox
nodes cannot be both.

## Testing

| What | How |
|---|---|
| Key conversion, crates, cue/grid encoding, ID3/WAV editing, XML, matching | `npm test` — fast unit tests |
| Parsers on corrupt input | fuzz tests in `test/security.test.mjs` |
| Real USB / real audio | `test/manual/*.mjs` (not in CI) |
| CSP and offline rules | `npm run lint` |

The Serato writers were checked by reading the output back with an independent implementation (Python
[mutagen](https://mutagen.readthedocs.io/)) and by comparing against tags Serato itself wrote. They have **not** been
exhaustively tested inside Serato DJ.
