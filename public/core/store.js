// Persistence in IndexedDB: the game state (one JSON document) and uploaded files (PDFs, images, HTML).
import { getIdCounter, setIdCounter } from './util.js';

const DB = 'saas-founder-sim';
const VERSION = 3; // v2 adds 'niches' (niche dossiers shared across saves), v3 'kv' (static-mode caches and queues)
let dbp = null;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result; // create only what is missing so v1 data (state, files) survives the upgrade
      for (const name of ['state', 'files', 'niches', 'kv']) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name);
    };
    req.onsuccess = () => {
      const d = req.result;
      // Another tab loading a newer build asks to upgrade the database: close this connection so its upgrade isn't
      // blocked forever (its boot would hang on a blank page); this tab reopens at the next read/write.
      d.onversionchange = () => { d.close(); if (opened === d) opened = null; dbp = null; };
      resolve(d);
    };
    req.onerror = () => { dbp = null; reject(req.error); }; // not cached: the next call tries again
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
    // A transaction can abort without an error event (quota exceeded at commit, the connection closing): without this
    // the save's promise never settled.
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export const saveState = (state) => { state.idCounter = getIdCounter(); return tx('state', 'readwrite', (s) => s.put(state, 'current')); };
export const loadState = async () => {
  let st = await tx('state', 'readonly', (s) => s.get('current'));
  const backup = readUnloadBackup();
  // Restore the id counter BEFORE re-saving: saveState stamps state.idCounter from the live counter, which is still
  // ~0 at boot, so saving first would reset it and new ids would collide with the save's existing ones.
  if (backup) { st = backup; setIdCounter(st.idCounter); await saveState(st); clearUnloadBackup(); }
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

// Small key-value store for static hosting (no server): the expensive-call disk cache (core/llm.js) and the
// in-browser research queue (core/niche-client.js). Shared by every save in this browser.
export const putKv = (key, value) => tx('kv', 'readwrite', (s) => s.put(value, key));
export const getKv = (key) => tx('kv', 'readonly', (s) => s.get(key));
export const deleteKv = (key) => tx('kv', 'readwrite', (s) => s.delete(key));

// ---- Imported save files (Settings → Import save) are untrusted JSON: check the top-level shape and strip
// prototype-pollution keys before they are copied into the live state. Individual app slices are not schema-checked.
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** Remove __proto__ / constructor / prototype own keys at every depth (in place). → the same value. */
export function stripDangerousKeys(root) {
  const stack = [root];
  while (stack.length) {
    const v = stack.pop();
    if (v == null || typeof v !== 'object') continue;
    for (const k of Object.keys(v)) {
      if (BAD_KEYS.has(k)) { delete v[k]; continue; }
      if (v[k] && typeof v[k] === 'object') stack.push(v[k]);
    }
  }
  return root;
}

/** Validate a parsed save file. → the cleaned save, or throws an Error whose message is fit for a toast. */
export function validateImportedSave(data) {
  const bad = (why) => { throw new Error(`Not a valid save file: ${why}.`); };
  if (!isObj(data)) bad('expected a JSON object');
  stripDangerousKeys(data);
  if (data.v !== 3) bad(`version ${JSON.stringify(data.v ?? null)} is not 3`);
  if (!Number.isInteger(data.day) || data.day < 0) bad('"day" must be a whole number of days');
  if (!isObj(data.company) || typeof data.company.name !== 'string') bad('"company" must be an object with a name');
  if (!isObj(data.founder)) bad('"founder" must be an object');
  if (!isObj(data.apps)) bad('"apps" must be an object');
  for (const k of ['personal', 'bank', 'metrics', 'mail', 'flags', 'cache', 'llmUsage']) if (data[k] != null && !isObj(data[k])) bad(`"${k}" must be an object`);
  for (const k of ['log', 'notifications', 'jobs', 'plans', 'recurring']) if (data[k] != null && !Array.isArray(data[k])) bad(`"${k}" must be a list`);
  if (data.seed != null && !Number.isFinite(data.seed)) bad('"seed" must be a number');
  if (data.idCounter != null && !(Number.isInteger(data.idCounter) && data.idCounter >= 0)) bad('"idCounter" must be a whole number');
  if (data.files != null && !Array.isArray(data.files)) bad('"files" must be a list');
  if (Array.isArray(data.files)) data.files = data.files.filter((f) => isObj(f) && typeof f.id === 'string' && f.id);
  return data;
}
