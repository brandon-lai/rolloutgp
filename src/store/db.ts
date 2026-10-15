// Tiny key-value store on IndexedDB, with localStorage and then memory as
// fallbacks (private windows can refuse IndexedDB). Uploaded sticker images are
// stored as Blobs, which only IndexedDB can hold; without it they live for the
// session.

const DB_NAME = "rolloutgp";
const STORES = ["kv", "uploads"] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r.result);
      t.onabort = t.onerror = () => resolve(undefined);
      r.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const fallback = localStorage.getItem(`${DB_NAME}:${key}`);
    if (fallback) return JSON.parse(fallback) as T;
  } catch { /* blocked storage */ }
  const v = await tx<T>("kv", "readonly", (s) => s.get(key) as IDBRequest<T>);
  if (v !== undefined) return v;
  try {
    const raw = localStorage.getItem(`${DB_NAME}:${key}`);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* storage blocked */
  }
  return memory.get(key) as T | undefined;
}

export async function setItem<T>(key: string, value: T): Promise<boolean> {
  const db = await open();
  if (db) {
    const ok = await tx("kv", "readwrite", (s) => s.put(value, key));
    if (ok !== undefined) {
      memory.delete(key);
      try { localStorage.removeItem(`${DB_NAME}:${key}`); } catch { /* unavailable */ }
      return true;
    }
  }
  try {
    localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value));
    memory.delete(key);
    return true;
  } catch {
    memory.set(key, value);
    return false;
  }
}

export async function putUpload(id: string, blob: Blob): Promise<boolean> {
  const ok = await tx("uploads", "readwrite", (s) => s.put(blob, id));
  if (ok === undefined) {
    memory.set(`upload:${id}`, blob);
    return false;
  }
  return true;
}

export async function getUpload(id: string): Promise<Blob | undefined> {
  const v = await tx<Blob>("uploads", "readonly", (s) => s.get(id) as IDBRequest<Blob>);
  return v ?? (memory.get(`upload:${id}`) as Blob | undefined);
}

/** Clear both stores in one committed transaction, or report failure. */
export async function clearAll(): Promise<void> {
  const db = await open();
  if (db) await new Promise<void>((resolve, reject) => {
    const t = db.transaction([...STORES], 'readwrite');
    for (const s of STORES) t.objectStore(s).clear();
    t.oncomplete = () => resolve();
    t.onabort = t.onerror = () => reject(new Error('Could not delete data. Your save has been kept.'));
  });
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(`${DB_NAME}:`)) localStorage.removeItem(k);
  } catch { /* unavailable */ }
  memory.clear();
}

/** Restore profile and stickers atomically. Never erase the existing save first. */
export async function restoreData(profile: unknown, uploads: Map<string, Blob>): Promise<void> {
  const db = await open();
  if (!db) throw new Error('Restoring a backup needs browser storage. Enable it and try again.');
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([...STORES], 'readwrite');
    t.objectStore('kv').put(profile, 'profile');
    for (const [id, blob] of uploads) t.objectStore('uploads').put(blob, id);
    t.oncomplete = () => resolve();
    t.onabort = t.onerror = () => reject(new Error('Restore failed. The previous save is unchanged.'));
  });
  memory.delete('profile');
  try { localStorage.removeItem(`${DB_NAME}:profile`); } catch { /* unavailable */ }
}
