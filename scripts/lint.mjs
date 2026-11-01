// Dependency-free checks: syntax of every module, plus the security rules the CSP relies on.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const problems = [];
const fail = (m) => problems.push(m);

for (const f of fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', path.join(root, 'js', f)], { stdio: 'pipe' }); }
  catch (e) { fail(`js/${f}: syntax error\n${e.stderr}`); }
}

const html = read('index.html');
const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
if (!csp) fail('index.html: missing Content-Security-Policy meta tag');
else {
  if (!/default-src 'none'/.test(csp)) fail("CSP must start from default-src 'none'");
  if (/unsafe-(inline|eval)/.test(csp)) fail('CSP must not allow unsafe-inline or unsafe-eval');
  if (!/connect-src 'none'/.test(csp)) fail("CSP must keep connect-src 'none' (the app never talks to a network)");
  if (/https?:/.test(csp)) fail('CSP must not allow any remote origin');
}
if (/\sstyle="/.test(html)) fail('index.html: inline style attributes are blocked by the CSP — use a class');
if (/<script(?![^>]*\ssrc=)[^>]*>/.test(html)) fail('index.html: inline <script> is blocked by the CSP');
if (/\son[a-z]+="/.test(html)) fail('index.html: inline event handlers are blocked by the CSP');
if (/<(script|link|img|iframe)[^>]+(src|href)="https?:/.test(html)) fail('index.html: external resource — Crate Bridge must not load third-party code');

for (const f of ['css/style.css', ...fs.readdirSync(path.join(root, 'js')).map((f) => `js/${f}`)]) {
  const t = read(f);
  if (/@import|url\(\s*['"]?https?:/.test(t)) fail(`${f}: external resource`);
  if (/\b(eval|new Function)\s*\(/.test(t)) fail(`${f}: eval / new Function`);
  if (/\.(innerHTML|outerHTML)\s*\+?=/.test(t) && f.endsWith('.js') && !/\besc\(/.test(t)) fail(`${f}: assigns HTML but never calls esc()`);
  if (/(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(t)) fail(`${f}: network call — the app is offline-only`);
}

if (problems.length) { console.error(problems.map((p) => '✖ ' + p).join('\n')); process.exit(1); }
console.log('lint ok: syntax, CSP and offline-only rules');
