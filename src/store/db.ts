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
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function getItem<T>(key: string): Promise<T | undefined> {
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
    if (ok !== undefined) return true;
  }
  try {
    localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value));
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

export async function clearAll(): Promise<void> {
  const db = await open();
  if (db) {
    for (const s of STORES) await tx(s, "readwrite", (st) => st.clear());
  }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(`${DB_NAME}:`)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  memory.clear();
}
