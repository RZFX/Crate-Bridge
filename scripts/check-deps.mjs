// Outdated-dependency check. Crate Bridge ships with zero runtime dependencies, so this covers
// everything else that can go stale: npm devDependencies, pinned GitHub Actions, and the Node version.
// Usage: node scripts/check-deps.mjs   (set GITHUB_TOKEN to avoid API rate limits)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// "uses: owner/repo@<sha> # v1.2.3" lines from workflow files
export function parseUses(text) {
  return [...text.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)(?:\/[^@\s]*)?@([0-9a-f]{7,40}|[\w.-]+)\s*(?:#\s*(v?[\d.]+))?/g)]
    .map((m) => ({ repo: m[1], ref: m[2], version: m[3] || null }));
}
export const major = (v) => Number(String(v).replace(/^v/, '').split('.')[0]);
export const isNewer = (latest, current) => {
  const a = String(latest).replace(/^v/, '').split('.').map(Number), b = String(current).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
};

async function get(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': 'crate-bridge-check-deps', ...headers } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function main() {
  const rows = [];
  const add = (kind, name, current, latest, outdated) => rows.push({ kind, name, current, latest, status: outdated ? 'OUTDATED' : 'ok' });
  const gh = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!Object.keys(deps).length) rows.push({ kind: 'npm', name: '(no dependencies)', current: '-', latest: '-', status: 'ok' });
  for (const [name, range] of Object.entries(deps)) {
    const { version } = await get(`https://registry.npmjs.org/${name}/latest`);
    const cur = range.replace(/^[^\d]*/, '');
    add('npm', name, cur, version, isNewer(version, cur));
  }

  const wfDir = path.join(root, '.github', 'workflows');
  const seen = new Map();
  for (const f of fs.readdirSync(wfDir)) for (const u of parseUses(fs.readFileSync(path.join(wfDir, f), 'utf8'))) seen.set(`${u.repo}`, u);
  for (const u of seen.values()) {
    try {
      // some repos (e.g. codeql-action) also publish non-semver releases, so pick the newest plain vX.Y.Z
      const rels = await get(`https://api.github.com/repos/${u.repo}/releases?per_page=30`, gh);
      const latest = rels.filter((r) => !r.prerelease && !r.draft && /^v\d+\.\d+\.\d+$/.test(r.tag_name)).map((r) => r.tag_name)
        .sort((a, b) => (isNewer(a, b) ? -1 : 1))[0];
      if (!latest) throw new Error('no semver release found');
      add('action', u.repo, u.version || u.ref, latest, u.version ? isNewer(latest, u.version) : false);
    } catch (e) { rows.push({ kind: 'action', name: u.repo, current: u.version || u.ref, latest: '?', status: `could not check (${e.message.split('→')[1]?.trim() || e.message})` }); }
  }

  const nvmrc = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  const index = await get('https://nodejs.org/dist/index.json');
  const lts = [...new Set(index.filter((r) => r.lts).map((r) => major(r.version)))].sort((a, b) => b - a);
  // current = the two newest LTS lines; older ones are in maintenance and about to reach end of life
  add('node', '.nvmrc (CI)', nvmrc, `${lts[0]} (LTS)`, !lts.slice(0, 2).includes(major(nvmrc)));

  const w = (k) => Math.max(...rows.map((r) => String(r[k]).length), k.length);
  const cols = ['kind', 'name', 'current', 'latest', 'status'];
  const widths = Object.fromEntries(cols.map((c) => [c, w(c)]));
  console.log(cols.map((c) => c.padEnd(widths[c])).join('  '));
  for (const r of rows) console.log(cols.map((c) => String(r[c]).padEnd(widths[c])).join('  '));
  const bad = rows.filter((r) => r.status === 'OUTDATED');
  console.log(bad.length ? `\n${bad.length} outdated. Dependabot should already have PRs open; otherwise update and re-run.` : '\nEverything is up to date.');
  process.exit(bad.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
