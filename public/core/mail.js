// Founder inbox. Prospects, investors, customers, candidates and vendors all talk to you here.

import { uid, rng, gaussian, isWeekend } from './util.js';

export const ensureMail = (state) => (state.mail ??= { threads: [] });

// kind: 'prospect' | 'investor' | 'customer' | 'candidate' | 'vendor' | 'system'
export function newThread(state, { subject, with: who, kind = 'system', app = null, refId = null }) {
  const t = { id: uid('th'), subject, with: who, kind, app, refId, messages: [], unread: false, lastDay: state.day, archived: false };
  ensureMail(state).threads.unshift(t);
  return t;
}

export function findThread(state, refId) {
  return ensureMail(state).threads.find((t) => t.refId === refId);
}

// from: 'me' | 'them'
export function addMessage(state, threadId, { from, body, subject = null, meta = {} }) {
  const t = ensureMail(state).threads.find((x) => x.id === threadId);
  if (!t) return null;
  const m = { id: uid('msg'), from, day: state.day, body, subject: subject ?? t.subject, meta };
  t.messages.push(m);
  t.lastDay = state.day;
  if (from === 'them') t.unread = true;
  // most recent first
  const box = ensureMail(state).threads;
  box.splice(box.indexOf(t), 1);
  box.unshift(t);
  return m;
}

export const unreadCount = (state) => ensureMail(state).threads.filter((t) => t.unread && !t.archived).length;

// How long people take to answer the founder, in days: median and 90th percentile of a lognormal, plus the chance
// they answer on a weekend. Sources (docs/research/email-reply-times.md): general email replies are fast when they
// come at all (Kooti et al. 2015, via press: median under an hour); candidates 4.7h median from the triggering
// message (Noon); about 90% of cold-outbound replies arrive within two days of the send (Lemlist via Prospeo).
// Investors, customers, lawyers, other founders and vendors are [design] estimates calibrated to those.
export const REPLY_DELAY = {
  vendor: { median: 0.05, p90: 0.6, weekend: 0.9 }, // salespeople and sequences answer within minutes [design]
  candidate: { median: 0.2, p90: 2.5, weekend: 0.4 }, // Noon: 4.7h median from the triggering message
  customer: { median: 0.3, p90: 2, weekend: 0.25 }, // SMB within hours; enterprise about a business day [design]
  network: { median: 0.5, p90: 3, weekend: 0.4 }, // other founders and partners [design]
  prospect: { median: 0.8, p90: 3, weekend: 0.1 }, // ~90% of replies within 2 days of a send [S]
  investor: { median: 1, p90: 4, weekend: 0.25 }, // warm: about a business day; evenings and weekends sometimes [design]
  legal: { median: 1, p90: 3, weekend: 0.05 }, // counsel and CPAs: about a business day [design]
  system: { median: 0, p90: 0, weekend: 1 },
};

// Day on which a reply to the founder's latest message arrives (deterministic via rng(state)). Where in the
// distribution it lands depends on the other side: `pull` in population standard deviations (negative = faster).
// Owner apps set `thread.replyPull` (an investor chasing a hot deal answers in hours; a lukewarm one takes days),
// and `thread.seniority` ('exec' answers slower, often via an assistant) [design, docs/research/timelines.md §2].
const A = 0.6;
export function replyDay(state, kind, { thread = null, pull = thread?.replyPull ?? 0 } = {}) {
  const d = REPLY_DELAY[kind] ?? REPLY_DELAY.network;
  if (!(d.median > 0)) return state.day;
  const sigma = Math.log(d.p90 / d.median) / 1.2816;
  const p = Math.max(-2.5, Math.min(2.5, pull + (thread?.seniority === 'exec' ? 0.7 : 0)));
  const z = A * p + Math.sqrt(1 - A * A) * gaussian(state);
  const days = Math.min(d.p90 * 3, d.median * Math.exp(sigma * z));
  // Under a day: whether it slips past today depends on when in the day you sent it.
  let day = state.day + Math.floor(days + rng(state));
  for (let i = 0; i < 3 && isWeekend(state, day) && rng(state) > d.weekend; i++) day++;
  return day;
}

// ---- Retention ----
// Inbound network email (core/network.js) adds threads every week, so an uncapped inbox grows saves forever. Every
// MAIL_RETENTION.everyDays the clock drops threads that are read or archived, untouched for MAIL_RETENTION.days and
// not referenced anywhere else in the state (an app holding the thread id, or the thread's refId still pointing at a
// live record, e.g. a CRM contact, an investor, a network inbound item). If more than MAIL_RETENTION.cap such
// unreferenced old-enough-or-read threads remain, the oldest of them go too. Unread live threads and referenced
// threads are never dropped [design: housekeeping, no gameplay effect].
export const MAIL_RETENTION = { days: 180, cap: 600, everyDays: 30 };

// Marks which of `ids` appear as a string value or object key anywhere in `node`.
function markRefs(node, ids, hit) {
  if (typeof node === 'string') { if (ids.has(node)) hit.add(node); return; }
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) markRefs(x, ids, hit); return; }
  for (const k of Object.keys(node)) {
    if (ids.has(k)) hit.add(k);
    markRefs(node[k], ids, hit);
  }
}

export function pruneMail(state, { days = MAIL_RETENTION.days, cap = MAIL_RETENTION.cap } = {}) {
  const box = ensureMail(state).threads;
  const prunable = (t) => t.archived || !t.unread;
  const candidates = box.filter(prunable);
  if (!candidates.length) return 0;
  const ids = new Set();
  for (const t of candidates) { ids.add(t.id); if (t.refId) ids.add(t.refId); }
  const hit = new Set();
  for (const k of Object.keys(state)) if (k !== 'mail') markRefs(state[k], ids, hit);
  const free = candidates.filter((t) => !hit.has(t.id) && !(t.refId && hit.has(t.refId)));
  const drop = new Set(free.filter((t) => (t.lastDay ?? 0) < state.day - days));
  const rest = free.filter((t) => !drop.has(t)).sort((a, b) => (a.lastDay ?? 0) - (b.lastDay ?? 0));
  for (let i = 0; i < rest.length - cap; i++) drop.add(rest[i]);
  if (!drop.size) return 0;
  state.mail.threads = box.filter((t) => !drop.has(t));
  return drop.size;
}
