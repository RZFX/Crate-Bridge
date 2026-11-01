# Troubleshooting

## The page says my browser isn't supported
Crate Bridge needs the File System Access API: desktop **Chrome, Edge or Opera** (other Chromium browsers such as
Vivaldi usually work too). **Brave** ships it switched off: open `brave://flags/#file-system-access-api`, set it to
*Enabled* and restart. **Safari and Firefox** don't offer it, and phones/tablets don't either.

## "Choose USB…" does nothing, or the browser refuses the folder
Chromium refuses a few folders for safety, such as system folders and sometimes the top level of Desktop, Documents
or Downloads. Pick the USB drive's root, or a subfolder. If a permission prompt was dismissed, click the button again.

## "No PIONEER/rekordbox/export.pdb"
Choose the **root** of the USB (the folder that contains `PIONEER` and `Contents`). The stick must have been
prepared with *Export* in Rekordbox. Crate Bridge can't read Rekordbox's own `master.db` (it is encrypted).

## Some tracks are "missing"
Rekordbox can keep a playlist entry after the audio file was deleted from the stick. Add the folder with your music
under *Music folders*, and Crate Bridge finds files by name (and size, when known). The destination gets a
`_missing_tracks.txt` for anything still absent.

## Serato doesn't show my crates
- Quit Serato **before** writing crates, then start it again.
- The "absolute path" field must be the real path of the destination, e.g. `/Users/you/Music/Restored`.
- Use a destination on your main drive. Crates that point at external drives are unverified.
- No Serato folder chosen? Crates are written to `_Serato_Subcrates` inside the destination: copy them into
  `~/Music/_Serato_/Subcrates` yourself.

## Cues or beatgrids look wrong in Serato
Serato may re-analyse a track and overwrite its grid. Memory cues become hot cues in free slots (Serato only has 8).
Please [open a bug](https://github.com/RZFX/Crate-Bridge/issues/new/choose) with the browser, the file type and what you expected.
FLAC and M4A files are copied but get no cues (only MP3, WAV and AIFF can be edited).

## The copy is slow, or stopped
Large libraries take a while: the browser tab must stay open and the computer awake. Re-running skips files that were
already copied, so you can simply start again. Use *Cancel* rather than closing the tab.

## The launcher says it can't start
`Crate Bridge.command` needs Python 3 or Ruby for a tiny local server (macOS usually has one). Alternatively run
`npm start` (Node 22+) or any static file server from the project folder, and open the address it prints in Chrome.
If macOS blocks the file, right-click it → *Open* once.

## Windows / Linux
There is no launcher yet. Run `npm start` and open `http://localhost:8765`.
