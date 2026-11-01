import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRekordboxXml, parseLength } from '../js/rbxml.js';

const track = (id, over = {}) => ({ id, path: `/Users/me/Music/Tune ${id}.mp3`, title: `T${id}`, artist: 'A', album: '', genre: '', key: 'Am', size: 5, seconds: 200, bpm: '170', cues: [], grid: [], ...over });

test('escapes special characters in attributes', () => {
  const x = buildRekordboxXml([track(1, { title: 'Rock & "Roll" <3', artist: "O'Neil" })], []);
  assert.ok(x.includes('Name="Rock &amp; &quot;Roll&quot; &lt;3"'));
  assert.ok(!x.includes('Roll" <3'));
});

test('encodes the file location as a URL', () => {
  const x = buildRekordboxXml([track(1, { path: '/Users/me/My Music/Tune #1.mp3' })], []);
  assert.ok(x.includes('Location="file://localhost/Users/me/My%20Music/Tune%20%231.mp3"'));
});

test('writes cues and tempo', () => {
  const x = buildRekordboxXml([track(1, { cues: [{ index: 2, ms: 1500, color: 'cc0000', name: 'drop' }], grid: [{ pos: 0.25, bpm: 174 }] })], []);
  assert.match(x, /<TEMPO Inizio="0.250" Bpm="174.00"/);
  assert.match(x, /<POSITION_MARK Name="drop" Type="0" Start="1.500" Num="2" Red="204" Green="0" Blue="0"\/>/);
});

test('nests playlists by path and keeps counts honest', () => {
  const x = buildRekordboxXml([track(1), track(2)], [{ path: 'Parent/Child', ids: [1, 2] }, { path: 'Solo', ids: [2] }]);
  assert.match(x, /<NODE Name="Parent" Type="0" Count="1">/);
  assert.match(x, /<NODE Name="Child" Type="1" KeyType="0" Entries="2">/);
  assert.match(x, /<NODE Name="ROOT" Type="0" Count="2">/);
  assert.match(x, /<COLLECTION Entries="2">/);
});

test('a crate holding tracks and sub-crates is split into a folder plus a playlist', () => {
  const x = buildRekordboxXml([track(1)], [{ path: 'P', ids: [1] }, { path: 'P/Sub', ids: [1] }]);
  assert.match(x, /<NODE Name="\(tracks\) P" Type="1"/);
});

test('parseLength reads mm:ss.xx and h:mm:ss', () => {
  assert.equal(parseLength('03:25.05'), 205);
  assert.equal(parseLength('1:00:00'), 3600);
  assert.equal(parseLength('junk'), 0);
});
