# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-11-01

First public version.

### Added
- **Restore playlists** from a Rekordbox USB export into one folder per playlist, with the folder hierarchy kept, optional `.m3u8` files and optional position prefixes.
- **Cue and beatgrid transfer**: Rekordbox hot cues, memory cues and beatgrids are written into the copies as Serato tags (MP3, WAV, AIFF).
- **Serato crates** written directly into a `_Serato_/Subcrates` folder, or into a folder to copy by hand.
- **Library diff**, **Serato → Rekordbox** (`rekordbox.xml` with cues and grids), **Duplicates**, **Missing files** and a **key converter**.
- macOS launcher (`Crate Bridge.command`) and a Dock app builder (`tools/make-mac-app.sh`).
- Content-Security-Policy that forbids any network access, plus `npm run lint` rules that keep it that way.
- Unit tests, fuzz tests for the file parsers, and CI on Node 22, 24 and 26.
- Weekly dependency check, Dependabot, CodeQL and OpenSSF Scorecard workflows.
