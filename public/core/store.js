// Persistence in IndexedDB: the game state (one JSON document) and uploaded files (PDFs, images, HTML).
import { getIdCounter, setIdCounter } from './util.js';

const DB = 'saas-founder-sim';
const VERSION = 1;
let dbp = null;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('state');
      req.result.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

export const saveState = (state) => { state.idCounter = getIdCounter(); return tx('state', 'readwrite', (s) => s.put(state, 'current')); };
export const loadState = async () => { const st = await tx('state', 'readonly', (s) => s.get('current')); if (st) setIdCounter(st.idCounter); return st; };
export const clearState = () => tx('state', 'readwrite', (s) => s.delete('current'));

// file: { id, name, mime, size, base64?, text?, addedDay, purpose }
export const putFile = (file) => tx('files', 'readwrite', (s) => s.put(file, file.id));
export const getFile = (id) => tx('files', 'readonly', (s) => s.get(id));
export const deleteFile = (id) => tx('files', 'readwrite', (s) => s.delete(id));
