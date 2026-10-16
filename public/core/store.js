// Persistence in IndexedDB: the game state (one JSON document) and uploaded files (PDFs, images, HTML).
import { getIdCounter, setIdCounter } from './util.js';

const DB = 'saas-founder-sim';
const VERSION = 2; // v2 adds the 'niches' store (niche dossiers shared across saves)
let dbp = null;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result; // create only what is missing so v1 data (state, files) survives the upgrade
      for (const name of ['state', 'files', 'niches']) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

let opened = null; // the open connection, so a save during page unload can start its transaction synchronously
function tx(store, mode, fn) {
  return opened ? run(opened, store, mode, fn) : db().then((d) => run((opened = d), store, mode, fn));
}

function run(d, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

export const saveState = (state) => { state.idCounter = getIdCounter(); return tx('state', 'readwrite', (s) => s.put(state, 'current')); };
export const loadState = async () => {
  let st = await tx('state', 'readonly', (s) => s.get('current'));
  const backup = readUnloadBackup();
  if (backup) { st = backup; await saveState(st); clearUnloadBackup(); }
  if (st) setIdCounter(st.idCounter);
  return st;
};
export const clearState = () => { clearUnloadBackup(); return tx('state', 'readwrite', (s) => s.delete('current')); };

// Browsers abort IndexedDB writes still running when the page unloads, so a save made on the way out (reload, tab
// close) also goes to localStorage synchronously. The next load restores it and moves it back to IndexedDB.
const BACKUP_KEY = 'saas-founder-sim:unload-backup';
export function saveStateOnUnload(state) {
  state.idCounter = getIdCounter();
  try { globalThis.localStorage?.setItem(BACKUP_KEY, JSON.stringify(state)); } catch { /* over quota: IndexedDB save below may still land */ }
  return saveState(state).then(clearUnloadBackup);
}
function readUnloadBackup() { try { return JSON.parse(globalThis.localStorage?.getItem(BACKUP_KEY) ?? 'null'); } catch { return null; } }
function clearUnloadBackup() { try { globalThis.localStorage?.removeItem(BACKUP_KEY); } catch {} }

// file: { id, name, mime, size, base64?, text?, addedDay, purpose }
export const putFile = (file) => tx('files', 'readwrite', (s) => s.put(file, file.id));
export const getFile = (id) => tx('files', 'readonly', (s) => s.get(id));
export const deleteFile = (id) => tx('files', 'readwrite', (s) => s.delete(id));
export const listFiles = () => tx('files', 'readonly', (s) => s.getAll());

// Ask the browser not to evict this site's storage under disk pressure (or Safari's 7-day rule). Best effort.
export const requestPersistence = async () => { try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; } };

// Niche dossiers (core/niche-cache.js): keyed by nicheKey, shared by every save in this browser.
export const putNiche = (key, dossier) => tx('niches', 'readwrite', (s) => s.put(dossier, key));
export const getNiche = (key) => tx('niches', 'readonly', (s) => s.get(key));
export const deleteNiche = (key) => tx('niches', 'readwrite', (s) => s.delete(key));
