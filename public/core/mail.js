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
