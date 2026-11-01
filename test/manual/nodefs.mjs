// Tiny File System Access shim over node:fs so the browser code can be tested headlessly.
import fs from 'node:fs';
import path from 'node:path';

export class NodeDir {
  constructor(p) { this.p = p; this.kind = 'directory'; this.name = path.basename(p); }
  async *entries() {
    for (const n of fs.readdirSync(this.p)) {
      const full = path.join(this.p, n);
      yield [n, fs.statSync(full).isDirectory() ? new NodeDir(full) : new NodeFile(full)];
    }
  }
  async getDirectoryHandle(n, { create } = {}) {
    const full = path.join(this.p, n);
    if (!fs.existsSync(full)) { if (!create) throw new DOMException('nf', 'NotFoundError'); fs.mkdirSync(full, { recursive: true }); }
    return new NodeDir(full);
  }
  async getFileHandle(n, { create } = {}) {
    const full = path.join(this.p, n);
    if (!fs.existsSync(full)) { if (!create) throw new DOMException('nf', 'NotFoundError'); fs.writeFileSync(full, ''); }
    return new NodeFile(full);
  }
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
}
export class NodeFile {
  constructor(p) { this.p = p; this.kind = 'file'; this.name = path.basename(p); }
  async getFile() { return Object.assign(await fs.openAsBlob(this.p), { name: this.name }); }
  async createWritable() {
    const tmp = this.p + '.swap', fd = fs.openSync(tmp, 'w');
    const s = new WritableStream({
      write(c) { fs.writeSync(fd, typeof c === 'string' ? Buffer.from(c) : c); },
      close: () => { fs.closeSync(fd); fs.renameSync(tmp, this.p); },
      abort: () => { fs.closeSync(fd); fs.rmSync(tmp, { force: true }); },
    });
    // real FileSystemWritableFileStream also has a direct write()
    s.write = async (c) => { const w = s.getWriter(); await w.write(c); w.releaseLock(); };
    return s;
  }
}
