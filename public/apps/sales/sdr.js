// AI SDR review modes (Outreach → AI SDR).
//   autopilot: the vendor agent sends everything itself; you never see an email (engine.aiSdrDay).
//   review:    the agent writes drafts, they wait in a queue, and nothing leaves until you approve it.
// Limits apply in both modes: daily cap, allowed segments, allowed personas, blocked claim types, required personalization.
//
// Operator quality (ARCHITECTURE principle 7):
//   stellar   review mode with tight limits; opens each draft, fixes or rejects flagged ones, rewrites generic copy
//             (the edit is judged by the same copy judge as sequences), rejects wrong-persona drafts.
//   good      review mode, reads most drafts, fixes the flagged ones.
//   average   autopilot with the default limits (the vendor default).
//   mediocre  review mode but approves everything in seconds / bulk-approves: behaves like autopilot AND pays the
//             review hours; a rubber-stamp mistake is logged every 20 decisions.
// Wrong-persona and hallucinated drafts that get sent keep the autopilot consequences (complaints, reputation, opt-outs).
//
// Numbers: hallucination 12–20% of emails and reply decay come from SALES.aiSdr (LeadGen Economy 2026, estimates).
// Everything else below is [design].
import { rng, chance, clamp, lerp, hash, words } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { syntheticPerson } from '../../core/market.js';
import { SALES } from './params.js';
import { analyzeCopy } from './copy.js';
import { ensureOutreach, addContact, nextSlot, createMeeting } from './model.js';
import { replyKind, prospectPain } from './replies.js';
import { emitSalesEvent } from './events.js';

export const REVIEW = {
  draftsMax: 40, // [design] drafts the agent can write per day in review mode (a founder cannot read more)
  queueMax: 60,
  ttlDays: 3, // drafts older than this go stale (the trigger it was written for has passed)
  wrongPersona: 0.12, // [design] drafts addressed to someone who is not the buyer
  generic: 0.3, // [design] template-slop drafts without a real hook
  flagRecall: 0.75, // [design] share of hidden fact/persona problems the vendor's checker flags
  carefulCatch: 0.5, // [design] chance a careful read spots a problem the checker missed
  fastSeconds: 20, // faster than this per draft is a skim, not a review
  minutes: { approve: 1.5, edit: 4, reject: 0.5, fast: 0.5 }, // founder minutes per decision [design]
  rubberWindow: 20, // decisions per rubber-stamp check
  rubberShare: 0.6, // this share of fast approvals in a window = rubber-stamping
  typicalQuality: 0.55, // an unedited agent draft; reply rate scales with quality / this
};

export const CLAIM_KINDS = { funding: 'Funding rounds', headcount: 'Headcount or growth', tech: 'Tech stack they use', customers: 'Customer names or results', revenue: 'Revenue figures' };
const CLAIMS = {
  funding: [['Congrats on the Series A you just closed.', 'series a']],
  headcount: [['Saw your team grew to 40 people this quarter.', '40 people']],
  tech: [['I noticed you run everything on Salesforce.', 'salesforce']],
  customers: [['We just helped Brightwell, a company like yours, cut costs by 30%.', 'brightwell']],
  revenue: [['With your $5M in annual revenue, this matters even more.', '$5m']],
};
const REAL_HOOKS = [
  (c) => `I saw ${c} is hiring for an operations role, so the manual work is probably landing on you.`,
  (c) => `${c} lists three service lines on your site, which usually means a lot of back-and-forth to keep track of.`,
  (c) => `${c} has been open for a few years with a small team, so I assume most of this still runs by hand.`,
];
const RIGHT_TITLES = ['Owner', 'Operations Manager', 'Founder', 'General Manager'];
const WRONG_TITLES = ['Intern', 'HR Coordinator', 'Facilities Assistant', 'Receptionist'];
const GENERIC_BODY = (my) => `I hope this email finds you well. I came across your company and was impressed by your innovative approach. ${my} is a cutting-edge, all-in-one, AI-powered platform that leverages seamless automation to streamline and transform your business. Let's book a 30 minute call to explore how we can take your business to the next level!`;

export const DEFAULT_LIMITS = () => ({ dailyCap: SALES.aiSdr.dailySends, segments: [], personas: '', blockedClaims: [], requirePersonalization: false });

export function ensureSdr(state) {
  const a = ensureOutreach(state).aiSdr;
  a.mode ??= 'autopilot';
  a.limits ??= DEFAULT_LIMITS();
  a.queue ??= [];
  a.outbox ??= [];
  a.review ??= { decisions: [], total: 0, approved: 0, edited: 0, rejected: 0, rejectedClean: 0, fast: 0, careful: 0, bulk: 0, caught: 0, sent: 0, qualitySum: 0, expReplies: 0, expired: 0, generated: 0, slipped: { hallucination: 0, wrongPersona: 0, generic: 0 }, rubberWindows: 0 };
  return a;
}

/** What the limits do to the agent (both modes). Defaults reproduce the vendor's baseline exactly. */
export function limitEffects(limits = DEFAULT_LIMITS()) {
  const blocked = limits.blockedClaims?.length ?? 0;
  const hasPersonas = Boolean(String(limits.personas ?? '').trim());
  const nSeg = limits.segments?.length ?? 0;
  const wrongP = REVIEW.wrongPersona * (hasPersonas ? 0.35 : 1) * (nSeg ? 0.7 : 1);
  let genericP = Math.min(0.5, REVIEW.generic + 0.03 * blocked); // fewer hooks to write about = more template copy
  const hallP = SALES.aiSdr.hallucination * (1 - 0.8 * blocked / Object.keys(CLAIM_KINDS).length);
  let vol = (hasPersonas ? 0.8 : 1) * (nSeg ? clamp(0.3 + 0.2 * nSeg, 0.3, 1) : 1);
  if (limits.requirePersonalization) { vol *= 1 - genericP; genericP = 0; } // the vendor drops drafts with no real hook
  return { wrongP, genericP, hallP, vol, cap: clamp(Math.round(Number(limits.dailyCap) || SALES.aiSdr.dailySends), 1, SALES.aiSdr.dailySends) };
}
/** Autopilot reply multiplier from the limits (1 at the vendor defaults). */
export function autopilotMult(fx) {
  const base = limitEffects();
  return ((1 - 0.8 * fx.wrongP) / (1 - 0.8 * base.wrongP)) * ((1 - 0.5 * fx.genericP) / (1 - 0.5 * base.genericP));
}

export function setMode(state, mode) {
  if (!['autopilot', 'review'].includes(mode)) throw new Error('Unknown AI SDR mode');
  const a = ensureSdr(state);
  a.mode = mode;
  return a;
}
export function setLimits(state, patch = {}) {
  const a = ensureSdr(state);
  const l = a.limits;
  if (patch.dailyCap != null) l.dailyCap = clamp(Math.round(Number(patch.dailyCap) || 1), 1, SALES.aiSdr.dailySends);
  if (patch.segments != null) l.segments = [...new Set([].concat(patch.segments).filter(Boolean))];
  if (patch.personas != null) l.personas = String(patch.personas).slice(0, 200);
  if (patch.blockedClaims != null) l.blockedClaims = [].concat(patch.blockedClaims).filter((k) => CLAIM_KINDS[k]);
  if (patch.requirePersonalization != null) l.requirePersonalization = Boolean(patch.requirePersonalization);
  return a;
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

const lower = (t) => String(t ?? '').toLowerCase();
const firstWord = (n) => String(n ?? '').split(' ')[0];

function personalizedNow(d) {
  const co = lower(d.person.company);
  const text = lower(d.body);
  return Boolean(co && text.includes(co)) || Boolean(d.hook && text.includes(lower(d.hook).slice(0, 18)));
}
/** Quality of the draft as it stands now (0..1): the sequence copy judge on the (possibly edited) text. */
export function draftQuality(d) {
  const body = `${d.body}${personalizedNow(d) ? '\n{{personalization}}' : ''}`; // credit a real company-specific line like a merge field
  return analyzeCopy({ subject: d.subject, body }, 0).score;
}
const claimInText = (d) => Boolean(d.claimKey) && lower(`${d.subject}\n${d.body}`).includes(d.claimKey);

/** Flags shown on a draft. The generic flag is the copy judge; fact and persona flags come from the vendor's checker, which misses ~25%. */
export function draftFlags(d) {
  const f = [];
  if (claimInText(d) && d.flagSeen) f.push({ id: 'hallucination', label: 'Possible hallucinated fact', detail: `"${d.claim}" is not in your CRM or on their site. Verify or cut it.` });
  if (d.wrongPersona && d.wpSeen) f.push({ id: 'wrong_persona', label: 'Wrong persona', detail: `${d.person.title} is not who you said buys this. Editing the wording will not fix who it goes to: reject it.` });
  const a = analyzeCopy({ subject: d.subject, body: d.body }, 0);
  if (d.quality < 0.5 || a.slop.length || a.buzz.length >= 2) f.push({ id: 'generic', label: 'Generic', detail: `Reads like template copy${a.slop.length ? ` ("${a.slop[0]}")` : ''}. Add one specific, true thing about them or reject.` });
  return f;
}
export const hiddenIssues = (d) => ({ hallucination: claimInText(d), wrongPersona: Boolean(d.wrongPersona), generic: d.quality < 0.5 });

function makeDraft(state, a, fx, blocked) {
  const person = syntheticPerson(state);
  const company = person.company ?? 'their company';
  const my = state.company.name || 'we';
  const wrong = chance(state, fx.wrongP);
  const generic = chance(state, fx.genericP);
  const kinds = Object.keys(CLAIMS).filter((k) => !blocked.includes(k));
  const hallu = kinds.length > 0 && !generic && chance(state, fx.hallP / (1 - fx.genericP || 1));
  const roll = [rng(state), rng(state), rng(state)]; // flag recall, persona recall, careful-read catch: fixed per draft
  person.title = (wrong ? WRONG_TITLES : RIGHT_TITLES)[Math.floor(rng(state) * 4)];
  const hookFn = REAL_HOOKS[Math.floor(rng(state) * REAL_HOOKS.length)];
  let line = hookFn(company), claim = '', claimKey = '', hook = line;
  if (hallu) {
    const k = kinds[Math.floor(rng(state) * kinds.length)];
    [claim, claimKey] = CLAIMS[k][0];
    line = claim;
    hook = '';
  }
  const one = String(state.company.oneLiner ?? '').trim().replace(/\.$/, '');
  const pitch = one ? `At ${my} we build ${one.charAt(0).toLowerCase() + one.slice(1)}.` : `${my} helps teams like yours save time.`;
  const body = generic
    ? `Hi ${firstWord(person.name)},\n\n${GENERIC_BODY(my)}\n\n${firstWord(state.founder?.name) || 'Founder'}`
    : `Hi ${firstWord(person.name)},\n\n${line}\n\n${pitch} Would it be useful if I sent a two-line example from a similar business?\n\nIf this isn't relevant, tell me and I won't follow up.\n\n${firstWord(state.founder?.name) || 'Founder'}`;
  const d = {
    id: `sdrd_${hash(`${state.seed}|${state.day}|${a.review.generated}|${person.email}`)}`, day: state.day, person, subject: generic ? `Transform ${company}` : `Quick question, ${company}`, body,
    hook: generic ? '' : hook, claim, claimKey, wrongPersona: wrong,
    flagSeen: hallu && roll[0] < REVIEW.flagRecall, wpSeen: wrong && roll[1] < REVIEW.flagRecall, catchRoll: roll[2], edited: false, original: body,
  };
  d.quality = draftQuality(d);
  return d;
}

// ---------------------------------------------------------------------------
// Founder decisions
// ---------------------------------------------------------------------------

function record(state, a, d, action, extra = {}) {
  const r = a.review;
  r.total++;
  const entry = { day: state.day, id: d.id, action, fast: Boolean(extra.fast), issues: hiddenIssues(d), fixed: extra.fixed ?? [] };
  r.decisions.push(entry);
  if (r.decisions.length > REVIEW.rubberWindow * 2) r.decisions.shift();
  if (r.total % REVIEW.rubberWindow === 0) {
    const win = r.decisions.slice(-REVIEW.rubberWindow);
    const fastApprovals = win.filter((x) => x.action === 'approve' && x.fast).length;
    if (fastApprovals / win.length >= REVIEW.rubberShare) {
      r.rubberWindows++;
      const missed = win.filter((x) => x.action === 'approve' && x.fast && (x.issues.hallucination || x.issues.wrongPersona || x.issues.generic)).length;
      logMistake(state, { functionId: 'cold_outreach', id: 'sdr_rubber_stamp', label: 'Rubber-stamped AI SDR drafts', app: 'outreach', key: `sdr_rubber:${Math.floor(r.total / REVIEW.rubberWindow)}`, cost: { hours: +(win.length * REVIEW.minutes.fast / 60).toFixed(2), reputation: 0.3 }, detail: `${fastApprovals} of the last ${win.length} decisions were approvals in under ${REVIEW.fastSeconds}s, and ${missed} of them had a problem. That is autopilot with extra steps. A stellar operator reads the flagged drafts, rewrites generic ones and rejects wrong-persona ones.` });
    }
  }
}
export const isRubberStamping = (state) => {
  const r = ensureSdr(state).review;
  const win = r.decisions.slice(-REVIEW.rubberWindow);
  return win.length >= 10 && win.filter((x) => x.action === 'approve' && x.fast).length / win.length >= REVIEW.rubberShare;
};

/** Founder minutes for a decision (for ctx.act hours). */
export const decisionHours = (kind, fast = false) => (kind === 'approve' ? (fast ? REVIEW.minutes.fast : REVIEW.minutes.approve) : REVIEW.minutes[kind] ?? REVIEW.minutes.approve) / 60;

/**
 * Approve a draft. `dwellSec` is how long the founder had the draft open (the UI measures it; null = unknown = fast).
 * A careful read (edited, or open >= fastSeconds) can notice a problem the checker missed: then the draft stays in
 * the queue with its flag now showing and { ok: false, caught } is returned.
 */
export function approveDraft(state, id, { dwellSec = null, bulk = false } = {}) {
  const a = ensureSdr(state);
  const d = a.queue.find((x) => x.id === id);
  if (!d) throw new Error('That draft is no longer in the queue.');
  const careful = !bulk && (d.edited || (dwellSec != null && dwellSec >= REVIEW.fastSeconds));
  if (careful) {
    const unseen = [];
    if (claimInText(d) && !d.flagSeen) unseen.push('hallucination');
    if (d.wrongPersona && !d.wpSeen) unseen.push('wrong_persona');
    if (unseen.length && d.catchRoll < REVIEW.carefulCatch) {
      d.flagSeen = true; d.wpSeen = d.wpSeen || d.wrongPersona;
      a.review.caught++;
      return { ok: false, caught: unseen };
    }
  }
  const sentIssues = hiddenIssues(d);
  const flaggedIds = draftFlags(d).map((f) => f.id);
  a.queue = a.queue.filter((x) => x.id !== id);
  a.outbox.push({ ...d, decision: { careful, bulk, flagged: flaggedIds, approvedDay: state.day } });
  const r = a.review;
  r.approved++; careful ? r.careful++ : r.fast++; if (bulk) r.bulk++;
  for (const k of Object.keys(sentIssues)) if (sentIssues[k]) r.slipped[k]++;
  record(state, a, d, 'approve', { fast: !careful });
  return { ok: true, careful, flagged: flaggedIds };
}
export function bulkApprove(state, ids) {
  let n = 0;
  for (const id of ids) { try { if (approveDraft(state, id, { bulk: true }).ok) n++; } catch { /* already gone */ } }
  return n;
}
export function rejectDraft(state, id) {
  const a = ensureSdr(state);
  const d = a.queue.find((x) => x.id === id);
  if (!d) throw new Error('That draft is no longer in the queue.');
  a.queue = a.queue.filter((x) => x.id !== id);
  const issues = hiddenIssues(d);
  if (!issues.hallucination && !issues.wrongPersona && !issues.generic) a.review.rejectedClean++; // a good lead thrown away
  a.review.rejected++;
  record(state, a, d, 'reject', { fast: false });
  return d;
}
/** Rewrite a draft. The new text is judged by the copy judge; removing the made-up claim fixes it. */
export function editDraft(state, id, { subject, body }) {
  const a = ensureSdr(state);
  const d = a.queue.find((x) => x.id === id);
  if (!d) throw new Error('That draft is no longer in the queue.');
  if (!String(body ?? '').trim()) throw new Error('A draft needs a body.');
  const hadClaim = claimInText(d);
  d.subject = String(subject ?? d.subject).slice(0, 120);
  d.body = String(body).slice(0, 2000);
  if (!d.edited) a.review.edited++;
  d.edited = true;
  d.quality = draftQuality(d);
  return { quality: d.quality, fixedClaim: hadClaim && !claimInText(d), words: words(d.body) };
}

// ---------------------------------------------------------------------------
// Daily
// ---------------------------------------------------------------------------

/** Review mode: send what was approved, expire stale drafts, write today's batch. deps: { recordReply }. */
export function sdrReviewDay(state, o, today, deps) {
  const a = ensureSdr(state);
  const A = SALES.aiSdr;
  const r = a.review;
  const fx = limitEffects(a.limits);
  const weeks = (state.day - (a.startDay ?? state.day)) / 7;
  const rate = lerp(A.replyStart, A.replyFloor, weeks / A.decayWeeks);
  const placement = clamp(0.35 + 0.55 * a.reputation / 100, 0.1, 0.9);
  const outbox = a.outbox.splice(0);
  for (const d of outbox) {
    const q = d.quality;
    const issues = hiddenIssues(d);
    const qm = clamp(q / REVIEW.typicalQuality, 0.3, 1.8);
    const p = rate * placement * qm * (issues.wrongPersona ? 0.15 : 1);
    r.sent++; r.qualitySum += q; r.expReplies += p;
    a.sent++; today.aiSent++;
    if (issues.hallucination) {
      a.hallucinations++;
      logMistake(state, { functionId: 'cold_outreach', id: 'sdr_hallucination_sent', label: 'An AI SDR email with a made-up fact went out', app: 'outreach', key: `sdrh:${d.id}`, cost: { reputation: 0.3 }, detail: `To ${d.person.name} at ${d.person.company}: "${d.claim}". ${d.decision.flagged.includes('hallucination') ? 'The draft was flagged and you approved it anyway.' : d.decision.careful ? 'The checker missed it and so did your read.' : 'You approved it without really reading it.'}` });
    }
    if (issues.wrongPersona) logMistake(state, { functionId: 'cold_outreach', id: 'sdr_wrong_persona_sent', label: 'An AI SDR email went to the wrong persona', app: 'outreach', key: `sdrw:${d.id}`, cost: { reputation: 0.1 }, detail: `${d.person.title} at ${d.person.company} cannot buy this; the account is now burned for a better-aimed email.` });
    const pComplaint = placement * 0.0012 * (issues.generic ? 2 : 1) + (issues.hallucination ? placement * 0.006 : 0);
    if (chance(state, pComplaint)) {
      a.complaints++;
      a.reputation = clamp(a.reputation - 2.5, 0, 100);
      logMistake(state, { functionId: 'cold_outreach', id: 'sdr_complaint', label: 'AI SDR email reported as spam', app: 'outreach', key: `sdrc:${d.id}`, charge: true, cost: { hours: 0.25, reputation: 0.5 }, detail: `${d.person.name} reported your approved draft${issues.hallucination ? ' (it contained a made-up fact)' : ''}. The vendor's domains lose reputation and you spend time on the cleanup.` });
      continue;
    }
    if (!chance(state, p)) continue;
    let contact;
    try {
      const added = addContact(state, { fullName: d.person.name, email: d.person.email, company: d.person.company, title: d.person.title, notes: 'Sourced by the AI SDR; you approved the email' }, { source: 'ai_sdr', status: 'contacted' });
      contact = added.contact;
    } catch { continue; }
    const pos = clamp(A.positiveShare * qm * (issues.wrongPersona ? 0.4 : 1), 0.05, 0.5);
    const kind = issues.hallucination && chance(state, 0.5) ? 'hallucination' : replyKind(pos, rng(state), rng(state), prospectPain(state, contact));
    a.replies++;
    deps.recordReply(state, { contact, kind, source: 'ai_sdr', subject: d.subject, body: d.body });
    if (kind === 'hallucination') notify(state, `${d.person.company} wrote back: your AI SDR told them something untrue. You approved that draft.`, { type: 'bad', app: 'outreach' });
    if (['interested', 'curious'].includes(kind) && chance(state, kind === 'interested' ? A.autoBook : A.autoBookCurious)) {
      const slot = nextSlot(state, { minLead: 2 + Math.floor(rng(state) * 5) });
      if (slot) { createMeeting(state, { contactId: contact.id, slot, source: 'ai_sdr' }); a.meetings++; }
    }
  }
  a.reputation = clamp(a.reputation + (70 - a.reputation) * 0.02, 0, 100);

  // Stale drafts expire: the hook it was written for is gone.
  const before = a.queue.length;
  a.queue = a.queue.filter((d) => state.day - d.day <= REVIEW.ttlDays);
  r.expired += before - a.queue.length;

  // Today's batch (the agent does not stop writing when you fall behind, until the queue is full).
  const n = Math.min(REVIEW.queueMax - a.queue.length, Math.round(Math.min(fx.cap, REVIEW.draftsMax) * fx.vol));
  const blocked = a.limits.blockedClaims ?? [];
  let made = 0;
  for (let i = 0; i < n; i++) { a.queue.push(makeDraft(state, a, fx, blocked)); r.generated++; made++; }
  if (made) emitSalesEvent(state, 'sdr_drafts_ready', { count: made, queued: a.queue.length }, `sdrq:${state.day}`);
  if (a.queue.length >= 30) emitSalesEvent(state, 'sdr_queue_backlog', { queued: a.queue.length, oldestDay: Math.min(...a.queue.map((d) => d.day)) }, `sdrb:${state.day}`);
}

/** Stats for the UI, the Scorecard and tests. */
export function sdrReviewStats(state) {
  const a = ensureSdr(state);
  const r = a.review;
  return {
    mode: a.mode, queued: a.queue.length, sent: r.sent, avgQuality: r.sent ? +(r.qualitySum / r.sent).toFixed(3) : null,
    expReplies: +r.expReplies.toFixed(2), expRepliesPer100: r.sent ? +(100 * r.expReplies / r.sent).toFixed(2) : null,
    slipped: { ...r.slipped }, caught: r.caught, approved: r.approved, rejected: r.rejected, edited: r.edited, fast: r.fast, careful: r.careful,
    rejectedClean: r.rejectedClean, expired: r.expired, rubber: isRubberStamping(state),
  };
}
