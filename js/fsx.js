// File System Access helpers (Chromium desktop browsers).
export const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
export const pickDir = (mode = 'read') => window.showDirectoryPicker({ mode });

const parts = (p) => p.split('/').filter(Boolean);

export async function getFileHandle(root, path) {
  try {
    const segs = parts(path);
    let dir = root;
    for (const s of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(s);
    return await dir.getFileHandle(segs[segs.length - 1]);
  } catch { return null; }
}

export async function getDirHandle(root, path, create = false) {
  let dir = root;
  for (const s of parts(path)) dir = await dir.getDirectoryHandle(s, { create });
  return dir;
}

export async function* walk(dir, prefix = '') {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.')) continue;
    if (h.kind === 'directory') yield* walk(h, prefix + name + '/');
    else yield { name, path: prefix + name, handle: h };
  }
}

export async function writeText(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

export async function requestWrite(handle) {
  return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted' ||
    (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

// Music folders the user added. Resolves absolute paths (as stored by Serato) and finds files by name.
export class Roots {
  constructor() { this.dirs = []; this.byName = new Map(); this.indexed = 0; }
  async add(handle) {
    this.dirs.push(handle);
    for await (const f of walk(handle)) {
      const k = f.name.normalize('NFC').toLowerCase();
      if (!this.byName.has(k)) this.byName.set(k, []);
      this.byName.get(k).push({ ...f, root: handle.name });
      this.indexed++;
    }
  }
  // /Users/me/Music/Contents/x/y.wav with a picked folder named "Contents" -> x/y.wav inside it
  async resolve(abs) {
    const segs = parts(abs);
    for (const d of this.dirs) {
      for (let i = segs.length - 2; i >= 0; i--) {
        if (segs[i] !== d.name) continue;
        const h = await getFileHandle(d, segs.slice(i + 1).join('/'));
        if (h) return h;
      }
    }
    return null;
  }
  // Best same-named file, preferring an exact size match.
  async findEntry(name, size) {
    const c = this.byName.get(name.normalize('NFC').toLowerCase());
    if (!c) return null;
    if (size) for (const f of c) if ((await f.handle.getFile()).size === size) return f;
    return c[0];
  }
  async findByName(name, size) { return (await this.findEntry(name, size))?.handle || null; }
}
