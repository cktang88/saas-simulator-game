// Spinners for buttons whose action waits on the LLM.
//
// Handlers don't need to opt in: a capture-phase click/submit listener remembers the button the player just pressed,
// and every LLM network request (core/llm.js gate) calls busyStart(). A request that starts within TRIGGER_MS of the
// press marks that button busy (spinner, aria-busy, clicks blocked) until all of its requests settle. A small pill
// also shows while any request is in flight, for calls started by jobs or by a button that was re-rendered away.
// UI only: no simulation state is read or written here, so wall-clock time is fine.

const TRIGGER_MS = 1500; // a handler may await local work (or a disk-cache miss) before its first request
const doc = globalThis.document;
let last = null; // { el, at } of the last press
let lastEnded = null; // { el, at } of the last button whose requests all settled: a follow-up call (retry, next step) re-attaches
let inflight = 0;
let pill = null;

const now = () => globalThis.performance?.now() ?? 0;

export function installBusyTracking() {
  if (!doc) return;
  const remember = (el) => { if (el) last = { el, at: now() }; };
  doc.addEventListener('click', (e) => remember(e.target?.closest?.('button, .btn, [role="button"]')), true);
  doc.addEventListener('submit', (e) => remember(e.submitter ?? e.target?.querySelector?.('button[type="submit"], button:not([type])')), true);
  // A busy button swallows further presses so an impatient double-click doesn't fire a second paid call.
  doc.addEventListener('click', (e) => { if (e.target?.closest?.('.llm-busy')) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
}

/** Marks the pressed button (if any, and recent) and the global pill busy. Returns a function that ends it. */
export function busyStart() {
  if (!doc) return () => {};
  const recent = (r) => (r && r.el.isConnected && now() - r.at < TRIGGER_MS ? r.el : null);
  const el = recent(last) ?? recent(lastEnded);
  if (el) {
    el._llmBusy = (el._llmBusy ?? 0) + 1;
    el.classList.add('llm-busy');
    el.setAttribute('aria-busy', 'true');
  }
  inflight++;
  showPill();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    inflight--;
    if (el && --el._llmBusy <= 0) {
      el._llmBusy = 0;
      el.classList.remove('llm-busy');
      el.removeAttribute('aria-busy');
      lastEnded = { el, at: now() };
    }
    showPill();
  };
}

function showPill() {
  if (!pill) {
    if (!doc.body) return;
    pill = doc.createElement('div');
    pill.className = 'llm-pill';
    pill.setAttribute('role', 'status');
    doc.body.appendChild(pill);
  }
  pill.hidden = inflight <= 0;
  pill.textContent = inflight > 1 ? `AI thinking… (${inflight})` : 'AI thinking…';
}
