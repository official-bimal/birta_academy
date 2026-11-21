import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

/**
 * Private object storage. Files are never public: they are read only through authorised API calls.
 *  - local  : files on disk under STORAGE_DIR (default .data/private-files). Used for development.
 *  - gcs    : Cloud Storage bucket (needs the Firebase/Cloud Storage bucket to exist, which on this project
 *             requires enabling Cloud Storage / the Blaze plan). Selected with STORAGE_BACKEND=gcs.
 */
export interface StorageProvider {
  readonly name: 'local' | 'gcs';
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

const ROOT = path.resolve(process.cwd(), process.env.STORAGE_DIR || '.data/private-files');

function safePath(key: string): string {
  const full = path.resolve(ROOT, key);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) throw new Error('Invalid storage key');
  return full;
}

class LocalStorage implements StorageProvider {
  readonly name = 'local' as const;
  async put(key: string, data: Buffer): Promise<void> {
    const full = safePath(key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, data);
  }
  async read(key: string): Promise<Readable> {
    const full = safePath(key);
    await fs.promises.access(full);
    return fs.createReadStream(full);
  }
  async remove(key: string): Promise<void> {
    await fs.promises.rm(safePath(key), { force: true });
  }
}

async function createGcs(): Promise<StorageProvider> {
  const { getStorage } = await import('firebase-admin/storage');
  const { adminApp } = await import('./firebaseAdmin.ts');
  const cfg = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8')) as { storageBucket: string };
  const bucket = getStorage(adminApp).bucket(cfg.storageBucket);
  return {
    name: 'gcs',
    async put(key, data, contentType) {
      await bucket.file(key).save(data, { contentType, resumable: false });
    },
    async read(key) {
      return bucket.file(key).createReadStream();
    },
    async remove(key) {
      await bucket.file(key).delete({ ignoreNotFound: true });
    },
  };
}

export const storage: StorageProvider = process.env.STORAGE_BACKEND === 'gcs' ? await createGcs() : new LocalStorage();
