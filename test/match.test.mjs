import test from 'node:test';
import assert from 'node:assert/strict';
import { norm, diffLibraries, findDuplicates } from '../js/match.js';

const t = (artist, title, path) => ({ artist, title, path, filename: path.split('/').pop() });

test('norm ignores case, accents and punctuation', () => {
  assert.equal(norm('Beyoncé – Halo (Original Mix)!'), 'beyoncehalooriginalmix');
});

test('diff matches by file name even when tags differ', () => {
  const rb = [t('', 'x', '/Contents/a/Song One.wav'), t('', 'y', '/Contents/a/Only Here.mp3')];
  const se = [t('A', 'B', '/Users/me/Song One.wav'), t('Q', 'Z', '/Users/me/Only There.mp3')];
  const d = diffLibraries(rb, se);
  assert.equal(d.both, 1);
  assert.deepEqual(d.onlyRb.map((x) => x.path), ['/Contents/a/Only Here.mp3']);
  assert.deepEqual(d.onlySe.map((x) => x.path), ['/Users/me/Only There.mp3']);
});

test('diff matches by artist and title', () => {
  const d = diffLibraries([t('Artist', 'Title', '/a/1.mp3')], [t('ARTIST', 'title!', '/b/other.mp3')]);
  assert.equal(d.both, 1);
});

test('short titles do not cause false matches', () => {
  assert.equal(diffLibraries([t('', 'Intro', '/a/1.mp3')], [t('', 'Intro', '/b/2.mp3')]).both, 0);
});

test('duplicates group copies, ignore a single file', () => {
  const g = findDuplicates([t('', 'x', '/a/Big Tune.mp3'), t('', 'x', '/b/Big Tune (2).mp3'), t('', 'x', '/c/Other Tune.mp3')]);
  assert.equal(g.length, 1);
  assert.equal(g[0].length, 2);
  assert.deepEqual(findDuplicates([t('', 'x', '/a/Same.mp3'), t('', 'x', '/a/Same.mp3')]), []);
});
