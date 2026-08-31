/**
 * db.js — camada de dados offline-first (IndexedDB)
 * Isolada do resto do app: ninguém fora daqui sabe que existe IndexedDB.
 * Todo registro tem: id, createdAt, updatedAt, deletedAt (null = ativo).
 */
const DB_NAME = 'orbita-entregas';
const DB_VERSION = 1;
const STORE = 'deliveries';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('deletedAt', 'deletedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function uid() {
  return 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export const DB = {
  async add(record) {
    const store = await tx(STORE, 'readwrite');
    const now = new Date().toISOString();
    const full = {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      status: 'pendente',
      ...record,
    };
    return new Promise((resolve, reject) => {
      const req = store.add(full);
      req.onsuccess = () => resolve(full);
      req.onerror = () => reject(req.error);
    });
  },

  async update(id, patch) {
    const store = await tx(STORE, 'readwrite');
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) return reject(new Error('Registro não encontrado'));
        const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  async softDelete(id) {
    return this.update(id, { deletedAt: new Date().toISOString() });
  },

  async restore(id) {
    return this.update(id, { deletedAt: null });
  },

  async hardDelete(id) {
    const store = await tx(STORE, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async all() {
    const store = await tx(STORE, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async active() {
    const rows = await this.all();
    return rows.filter((r) => !r.deletedAt);
  },

  async trashed() {
    const rows = await this.all();
    return rows.filter((r) => !!r.deletedAt);
  },

  async replaceAll(records) {
    const store = await tx(STORE, 'readwrite');
    return new Promise((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        records.forEach((r) => store.put(r));
        resolve();
      };
      clearReq.onerror = () => reject(clearReq.error);
    });
  },
};
