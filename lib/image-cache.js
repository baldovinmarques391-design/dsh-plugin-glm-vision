/**
 * Image Persistent Cache — content-addressed with SHA-256 dedup.
 * @module dsh-plugin-glm-vision/image-cache
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const DEFAULT_CACHE_DIR = process.env.DSH_HOME
  ? join(process.env.DSH_HOME, 'image-cache')
  : join(tmpdir(), 'dsh-glm-image-cache');

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'
};

export class ImageCache {
  constructor(cacheDir) {
    this.cacheDir = cacheDir || DEFAULT_CACHE_DIR;
    if (!existsSync(this.cacheDir)) mkdirSync(this.cacheDir, { recursive: true });
    this.index = new Map();
    try {
      for (const file of readdirSync(this.cacheDir)) {
        if (file.startsWith('.')) continue;
        const fp = join(this.cacheDir, file);
        if (statSync(fp).isFile()) {
          const hash = file.replace(/\.[^.]+$/, '');
          if (hash.length === 64) this.index.set(hash, fp);
        }
      }
    } catch {}
  }

  _hash(data) { return createHash('sha256').update(data).digest('hex'); }

  _detectMime(data) {
    if (data.length < 4) return null;
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'image/jpeg';
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return 'image/png';
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return 'image/gif';
    if (data.length >= 12 && data[0] === 0x52 && data[8] === 0x57) return 'image/webp';
    if (data[0] === 0x42 && data[1] === 0x4D) return 'image/bmp';
    return null;
  }

  store(data, mimeType) {
    const hash = this._hash(data);
    const existing = this.index.get(hash);
    if (existing && existsSync(existing)) {
      const mime = mimeType || EXT_TO_MIME[extname(existing).toLowerCase()] || this._detectMime(data) || 'application/octet-stream';
      return { hash, path: existing, mimeType: mime, isNew: false };
    }
    const mime = mimeType || this._detectMime(data) || 'application/octet-stream';
    const ext = Object.entries(EXT_TO_MIME).find(([, v]) => v === mime)?.[0] || '.bin';
    const filePath = join(this.cacheDir, `${hash}${ext}`);
    writeFileSync(filePath, data);
    this.index.set(hash, filePath);
    return { hash, path: filePath, mimeType: mime, isNew: true };
  }

  storeFile(filePath) {
    const data = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const mime = EXT_TO_MIME[ext] || this._detectMime(data) || 'application/octet-stream';
    return this.store(data, mime);
  }

  async storeUrl(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Fetch image failed: ${response.status}`);
    const buf = Buffer.from(await response.arrayBuffer());
    const ct = response.headers.get('content-type');
    const mime = ct?.split(';')[0]?.trim() || this._detectMime(buf) || 'application/octet-stream';
    return this.store(buf, mime);
  }

  getPath(hash) {
    const path = this.index.get(hash);
    return (path && existsSync(path)) ? path : null;
  }

  stats() { return { entries: this.index.size, dir: this.cacheDir }; }
}
