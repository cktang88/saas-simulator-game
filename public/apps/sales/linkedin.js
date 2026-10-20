// LinkedIn prospecting (Sales Navigator-style search, intent signals, warm-up, connect / DM / InMail, account health).
// Research: docs/research/cold-email-alternatives-2026.md (sections 2-3, operator tiers, simulation hooks) and
// docs/research/sales-and-research.md. Operator reader: linkedin_prospecting (./linkedin-reader.js).
//
// People come from the shared prospect universe (prospector.js universe/rowById: the same companies and people the
// prospect database shows), plus a few synthetic engagers (recruiters, engagement-pod bots, vendors) that only exist
// on LinkedIn. Every person carries HIDDEN LinkedIn truth (stable per company + person): active on LinkedIn or not,
// posted recently and about what, in-market this quarter, a recent job change, shared experience with the founder,
// responsiveness. The player sees what LinkedIn shows (a filter flag, a profile after viewing it). Acceptance and
// replies are emergent: hidden truth x whether the message references something TRUE about the person, is short and
// not a pitch, and is not the same template sent to everyone (similarity across sends, computed by the engine).
//
// Numbers ([design] = simulator assumption, never a real statistic):
//  - weekly invitation limit ~100 (vendor-observed, SALES.linkedin.weeklyLimit); connection acceptance 28.5% average,
//    17.5-40.1% by industry, message reply 10.4% blended (Expandi 13.2M requests 2025-26 [vendor]); engaged prospects
//    replied 36.4% vs 11.4% cold (8,423-message practitioner set [anecdotal]).
//  - Sales Navigator Core ~$99/month with 50 InMail credits a month; an InMail credit comes back when the recipient
//    replies within 90 days (LinkedIn help pages). InMail reply base 12% [unverified: vendor claims 10-25%].
//  - 95-5 rule: about 5% of B2B buyers are in market in a given quarter (LinkedIn B2B Institute, Dawes 2021).
//  - Automation tool ~$99/month (Expandi/Dripify-style list prices [unverified]); restriction escalation warning ->
//    temporary restriction (a week or more) -> permanent loss (vendor-observed, Surfe / La Growth Machine 2025).
//  - Everything else below is [design].
import { clamp, hash, uid, rng, chance, isWeekend, dayOfMonth } from '../../core/util.js';
import { post, addRecurring } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { SALES, salesTimeline } from './params.js';
import { ensureOutreach, ensureCrm, addContact, addActivity, contactById, companyById } from './model.js';
import { universe, rowById, search as dbSearch, SENIORITY } from './prospector.js';
import { recordReply } from './engine.js';
import { replyKind, prospectPain } from './replies.js';

export const LI = {
  // Share of each segment group's people who use LinkedIn at least weekly [design, anchored to ~30% of members
  // being monthly active and decision makers in tech/professional services being far more active than trades].
  activeShare: { company: 0.65, professional: 0.55, regulated: 0.5, health: 0.4, public: 0.4, education: 0.45, nonprofit: 0.4, owner_smb: 0.35 },
  postedShare: 0.4, // [design] active members who posted or commented publicly in the last 30 days
  inMarketBase: 0.05, // 95-5 rule (LinkedIn B2B Institute)
  jobChangeLift: 3, // [design] a new leader re-evaluates tools in the first 90 days
  sharedExpShare: 0.03, // [design]
  acceptActive: 0.34, acceptInactive: 0.17, // [design] inactive members accept late, when they next log in; a cold ICP list lands ~25%
  replyBase: 0.1, // message reply after accept (Expandi blended 10.4%)
  engagedReplyLift: 3.2, // 36.4% / 11.4% (practitioner set)
  inmailReply: 0.12, // [unverified]
  inmailCredits: 50,
  autoMonthly: 99, // automation tool [unverified]
  noteChars: { free: 200, nav: 300 },
  hours: { search: 0.1, view: 0.03, comment: 0.12, connect: 0.02, note: 0.05, dm: 0.1, voice: 0.06, inmail: 0.12, save: 0.01, alert: 0.05, signals: 0.05, autoSetup: 0.5 },
};

// What people post about, by segment group (their problem, not your product) [design].
const TOPICS = {
  company: ['scaling the ops team without hiring', 'month-end close taking too long', 'tool sprawl after the Series A', 'onboarding new hires faster', 'hitting the revenue plan with a lean team'],
  professional: ['billable hours lost to admin', 'client intake chaos', 'hiring a second associate', 'getting paid on time by clients', 'moving the practice off spreadsheets'],
  regulated: ['audit season prep', 'compliance reporting by hand', 'legacy systems that do not talk to each other', 'vendor risk reviews'],
  health: ['front desk overwhelmed by calls', 'no-shows eating the schedule', 'insurance paperwork backlog', 'staff burnout at the practice'],
  public: ['procurement taking a year', 'residents waiting on permits', 'paper forms in 2026', 'small team big mandate'],
  education: ['teacher workload', 'parent communication overload', 'budget season', 'student data privacy'],
  nonprofit: ['donor retention', 'volunteer scheduling', 'grant reporting by hand', 'doing more with a small staff'],
  owner_smb: ['chasing late invoices', 'finding good techs', 'scheduling jobs by text message', 'quoting faster than competitors', 'busy season staffing'],
};
const STOP = new Set('the and for with that this from your you our are was have has not but all any can will just about into than then them they what when who how why its it a an to of in on at by is be as or we i my me so if do'.split(' '));
const toks = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));

function prng(seedStr) {
  let a = parseInt(hash(seedStr), 36) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const worldKey = (state) => `${state.company.name}|${state.company.model}`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function ensureLinkedin(state) {
  const o = ensureOutreach(state);
  const L = o.linkedin;
  L.requests ??= [];
  L.messages ??= [];
  L.people ??= {}; // id -> { snap, viewedDay, commentDay, commentQ, saved, contactId, connected, requestedDay, dms, inmails, annoyed }
  L.viewers ??= []; // { id, day, why }
  L.alerts ??= []; // { day, id, text, kind }
  L.savedSearches ??= []; // { id, name, filters, alert }
  L.log ??= []; // every send, for the reader and mistakes: { day, kind, id, fit, active, inMarket, signal, warm, q, pitch, template, falseClaim, creepy, auto, hours, engagerKind }
  L.health ??= { level: 0, restrictedUntil: null, lostUntil: null, reports: [], events: [], limitCut: 1, lastEventDay: null };
  L.inmail ??= { credits: 0, month: null };
  L.auto ??= { on: false, perDay: 20, note: '', filters: null, recurringId: null, sent: 0 };
  return L;
}

// ---------------------------------------------------------------------------
// People and hidden truth
// ---------------------------------------------------------------------------

const SYN = {
  recruiter: { titles: ['Talent Partner', 'Technical Recruiter', 'Executive Search Consultant'], company: ['Hirewell Search', 'TalentBridge', 'Apex Recruiting'] },
  bot: { titles: ['Growth Hacker | 10x your leads', 'LinkedIn Ghostwriter | DM me "GROWTH"', 'Engagement Pod Member'], company: ['Self-employed', 'GrowthPod', 'ViralReach'] },
  vendor: { titles: ['SDR', 'Account Executive', 'Partnerships Manager'], company: ['LeadFlow AI', 'OutboundX', 'DataPro Leads'] },
};

/** Unified person view: a universe row, a synthetic engager, or a CRM contact (`ct:<id>`). */
export function personOf(state, id) {
  if (!id) return null;
  const L = ensureLinkedin(state);
  if (id.startsWith('ct:')) {
    const c = contactById(state, id.slice(3));
    if (!c) return null;
    const co = companyById(state, c.companyId) ?? {};
    const fit = co.prospect?.fit ?? co.research?.fit ?? co.inboundFit ?? 0.4;
    const sen = /\b(owner|founder|ceo|president|chief|partner)\b/i.test(c.title ?? '') ? 'owner' : /\b(vp|head|director)\b/i.test(c.title ?? '') ? 'vp' : /manager/i.test(c.title ?? '') ? 'manager' : 'ic';
    return { id, kind: 'buyer', first: c.firstName || (c.name ?? '').split(' ')[0], name: c.name || [c.firstName, c.lastName].join(' '), title: c.title ?? '', seniority: sen, companyName: co.name ?? '', employees: co.employees ?? (Number(co.size) || null), geo: co.prospect?.geo ?? '', segLabel: co.industry ?? '', group: 'company', fit, contactId: c.id };
  }
  if (L.people[id]?.snap) return L.people[id].snap;
  if (id.startsWith('lix_')) return syntheticById(state, id);
  const row = rowById(state, id);
  return row ? fromRow(row) : null;
}

function fromRow(row) {
  const { co, p } = row;
  return { id: row.id, kind: 'buyer', first: p.first, name: `${p.first} ${p.last}`, title: p.title, seniority: p.seniority, companyName: co.name, domain: co.domain, industry: co.industry, employees: co.employees, geo: co.geo, segId: co.segId, segLabel: co.segLabel, group: co.group, fit: row.fit, wrongPersona: row.wrongPersona };
}

function synthetic(state, id, kind) {
  const r = prng(`lix|${worldKey(state)}|${id}`);
  const pk = (a) => a[Math.floor(r() * a.length)];
  const first = pk(['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Riley', 'Casey', 'Jamie', 'Drew', 'Avery']);
  const last = pk(['Reed', 'Hart', 'Lane', 'Cole', 'Park', 'Shaw', 'Byrne', 'Quinn', 'Stone', 'Webb']);
  const S = SYN[kind] ?? SYN.bot;
  return { id, kind, first, name: `${first} ${last}`, title: pk(S.titles), seniority: 'ic', companyName: pk(S.company), employees: Math.round(5 + r() * 200), geo: 'US', segLabel: kind === 'recruiter' ? 'Staffing and recruiting' : kind === 'vendor' ? 'Sales software' : 'Marketing services', group: 'synthetic', fit: 0.02, synthetic: true };
}
const synCache = new Map();
function syntheticById(state, id) {
  if (synCache.has(id)) return synCache.get(id);
  const kind = id.split('_')[1] ?? 'bot';
  const p = synthetic(state, id, kind);
  synCache.set(id, p);
  return p;
}

/** Hidden LinkedIn truth for a person. Stable per company + person; in-market rolls per quarter. */
export function truthOf(state, person, day = state.day) {
  const r = prng(`litruth|${worldKey(state)}|${person.id}`);
  const engaged = engagerIndex(state).get(person.id);
  let active = r() < (LI.activeShare[person.group] ?? 0.45);
  if (person.synthetic) active = true;
  if (engaged) active = true; // engaging is proof of activity
  const postedU = r();
  const posted30 = active && !person.synthetic && postedU < LI.postedShare;
  const topics = TOPICS[person.group] ?? TOPICS.company;
  const topic = topics[Math.floor(r() * topics.length)];
  const jobChangeDay = r() < 0.5 ? Math.floor(-400 + r() * 1600) : null; // ~11% change jobs a year [design]
  const jobChanged90 = !person.synthetic && jobChangeDay != null && jobChangeDay <= day && jobChangeDay > day - 90;
  const sharedExp = !person.synthetic && r() < LI.sharedExpShare ? (r() < 0.5 ? 'same university' : 'same former employer') : null;
  const responsiveness = 0.5 + r();
  const followsU = r();
  const q = Math.floor(day / 90);
  const qU = prng(`liq|${worldKey(state)}|${person.id}|${q}`)();
  const fit = person.fit ?? 0.3;
  let pIn = LI.inMarketBase * (fit >= 0.55 ? 1.6 : fit >= 0.35 ? 0.7 : 0.15);
  if (jobChanged90) pIn *= LI.jobChangeLift;
  if (engaged?.icp) pIn *= engaged.competitor ? 3 : 2; // [design] engaging with problem / competitor content is an intent signal
  const inMarket = !person.synthetic && qU < Math.min(0.6, pIn);
  return { active, posted30, topic, jobChangeDay, jobChanged90, sharedExp, responsiveness, followsU, inMarket, pain: fit, engaged };
}

/** Does this person follow your company page? Grows with your audience; buyers in your market more likely [design]. */
const followsCompany = (state, person, t) => t.followsU < Math.min(0.2, (state.founder?.network?.linkedin ?? 0) / 25000) * ((person.fit ?? 0) >= 0.55 ? 1.6 : 0.5);

// ---------------------------------------------------------------------------
// Engagers: your posts and competitor posts
// ---------------------------------------------------------------------------

let icpCache = { key: null, buyers: [], others: [] };
function pools(state) {
  const u = universe(state);
  if (icpCache.key === u.key && icpCache.rows === u.rows) return icpCache;
  const buyers = [], others = [];
  for (const r of u.rows) {
    if (r.fit >= 0.55 && !r.wrongPersona) buyers.push(r);
    else if (r.fit < 0.4) others.push(r);
  }
  icpCache = { key: u.key, rows: u.rows, buyers, others };
  return icpCache;
}

/** How much a post speaks to your buyer's problem (0.2-1): overlap with the ICP and one-liner, product-only posts lose [design]. */
export function postRelevance(state, text) {
  const target = new Set(toks(`${state.company.icp} ${state.company.oneLiner}`));
  const words = toks(text);
  const hits = new Set(words.filter((w) => target.has(w))).size;
  let rel = 0.25 + 0.2 * Math.min(4, hits);
  if (/\b(we (just )?(shipped|launched|released)|new feature|our (product|app|platform)|sign up|free trial|link in (the )?comments)\b/i.test(text)) rel *= 0.6;
  return clamp(rel, 0.2, 1);
}

/**
 * The hidden mix of people who engaged with a post: ICP buyers, peers (founders, marketers), recruiters, engagement-pod
 * bots and vendors. Content quality (judge skill) and relevance to the buyer's problem decide the ICP share [design]:
 * a sharp problem post from a skilled writer ~30-40% buyers, a generic or product-only post under 10%.
 */
export function engagerMix(skill, rel, competitor = false) {
  const icp = competitor ? 0.3 : clamp(0.03 + 0.42 * skill * rel, 0.03, 0.45);
  const bot = competitor ? 0.08 : clamp(0.05 + 0.3 * (1 - skill), 0.05, 0.35);
  const recruiter = 0.07, vendor = competitor ? 0.15 : 0.1;
  return { icp, bot, recruiter, vendor, peer: Math.max(0, 1 - icp - bot - recruiter - vendor) };
}

const engCache = new Map(); // post key -> engagers
function genEngagers(state, key, n, mix, source) {
  const ck = `${worldKey(state)}|${state.company.icp ?? ''}|${state.company.oneLiner ?? ''}|${key}|${n}|${mix.icp.toFixed(3)}`;
  if (engCache.has(ck)) return engCache.get(ck);
  const r = prng(`eng|${ck}`);
  const P = pools(state);
  const out = [];
  const used = new Set();
  for (let i = 0; i < n; i++) {
    const u = r();
    let kind = 'peer';
    let acc = mix.icp;
    if (u < acc) kind = 'icp'; else if (u < (acc += mix.bot)) kind = 'bot'; else if (u < (acc += mix.recruiter)) kind = 'recruiter'; else if (u < (acc += mix.vendor)) kind = 'vendor';
    const how = r() < (kind === 'bot' ? 0.5 : kind === 'icp' ? 0.25 : 0.15) ? 'comment' : 'like';
    let id;
    if (kind === 'icp' || kind === 'peer') {
      const pool = kind === 'icp' ? P.buyers : P.others;
      if (!pool.length) continue;
      let row;
      for (let t = 0; t < 5; t++) { row = pool[Math.floor(r() * pool.length)]; if (!used.has(row.id)) break; }
      if (used.has(row.id)) continue;
      id = row.id;
    } else id = `lix_${kind}_${hash(`${ck}|${i}`)}`;
    used.add(id);
    out.push({ id, kind, how, source });
  }
  engCache.set(ck, out);
  return out;
}

/** Your LinkedIn posts (Organic -> Build in public) with their engagers. */
export function yourPosts(state, { days = 60 } = {}) {
  const posts = (state.apps.organic?.posts ?? []).filter((p) => p.platform === 'linkedin' && p.day > state.day - days);
  return posts.map((p) => {
    const rel = postRelevance(state, p.text);
    const skill = clamp(p.skill ?? 0.5, 0, 1);
    const n = Math.min(40, Math.max(0, Math.round(p.engagements ?? 0)));
    return { post: p, rel, skill, mix: engagerMix(skill, rel), engagers: genEngagers(state, `own|${p.id}`, n, engagerMix(skill, rel), 'own').map((e) => ({ ...e, postId: p.id })) };
  });
}

/** Competitor posts this week and their engagers (people evaluating the category) [design]. */
export function competitorPosts(state) {
  const rivals = (state.apps.world?.rivals ?? []).filter((c) => c.status !== 'dead' && c.name).map((c) => c.name);
  const names = rivals.length ? rivals : ['the category leader', 'a funded competitor'];
  const week = Math.floor(state.day / 7);
  const out = [];
  for (let k = 0; k < 2; k++) {
    const name = names[(week + k) % names.length];
    const r = prng(`comp|${worldKey(state)}|${week}|${k}`);
    const topic = (TOPICS.company.concat(TOPICS.owner_smb))[Math.floor(r() * 9)];
    const id = `cp_${week}_${k}`;
    out.push({ id, competitor: name, day: week * 7 + Math.floor(r() * 5), text: `${name} posted about ${topic}`, topic, engagers: genEngagers(state, `comp|${id}`, 18, engagerMix(0, 0, true), 'competitor').map((e) => ({ ...e, postId: id, competitor: name })) });
  }
  return out;
}

let idxCache = { stamp: null, map: new Map() };
/** id -> { icp, comment, competitor, postId, day } for everyone who engaged with your posts or a competitor's (60 days). */
export function engagerIndex(state) {
  const posts = state.apps.organic?.posts ?? [];
  const stamp = `${worldKey(state)}|${state.day}|${posts.length}|${posts[0]?.id ?? ''}`;
  if (idxCache.stamp === stamp) return idxCache.map;
  const map = new Map();
  idxCache = { stamp, map }; // set first: truthOf -> engagerIndex re-entry returns the partial map
  for (const p of posts) {
    if (p.platform !== 'linkedin' || p.day <= state.day - 60) continue;
    const mix = engagerMix(clamp(p.skill ?? 0.5, 0, 1), postRelevance(state, p.text));
    for (const e of genEngagers(state, `own|${p.id}`, Math.min(40, Math.round(p.engagements ?? 0)), mix, 'own')) if (!map.has(e.id)) map.set(e.id, { icp: e.kind === 'icp', kind: e.kind, comment: e.how === 'comment', competitor: false, postId: p.id, postText: p.text, day: p.day });
  }
  const week = Math.floor(state.day / 7);
  for (let k = 0; k < 2; k++) {
    const id = `cp_${week}_${k}`;
    for (const e of genEngagers(state, `comp|${id}`, 18, engagerMix(0, 0, true), 'competitor')) if (!map.has(e.id)) map.set(e.id, { icp: e.kind === 'icp', kind: e.kind, comment: e.how === 'comment', competitor: true, postId: id, day: week * 7 });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Search (Sales Navigator-style)
// ---------------------------------------------------------------------------

export const LI_FILTERS = { title: '', seniority: [], minEmp: '', maxEmp: '', segment: '', geo: '', jobChange: false, posted: false, follows: false, viewed: false, engaged: false, shared: false, excludeContacted: true };
export const NAV_ONLY = ['jobChange', 'posted', 'follows', 'shared']; // Sales Navigator lead filters ("viewed your profile" and post engagers are visible on any account)

/** Search people. Returns visible person cards (no hidden truth). */
export function searchPeople(state, f = LI_FILTERS, { limit = 25 } = {}) {
  const L = ensureLinkedin(state);
  const nav = Boolean(L.salesNav);
  for (const k of NAV_ONLY) if (f[k] && !nav) throw new Error('That filter needs Sales Navigator.');
  const rows = dbSearch(state, { title: f.title, seniority: f.seniority, minEmp: f.minEmp, maxEmp: f.maxEmp, segment: f.segment, geo: f.geo, excludeOwned: false, excludeBurned: false });
  const idx = engagerIndex(state);
  const viewers = new Set(L.viewers.filter((v) => v.day > state.day - 90).map((v) => v.id));
  const out = [];
  let total = 0;
  for (const row of rows) {
    const person = fromRow(row);
    if (f.excludeContacted !== false && (L.people[row.id]?.requestedDay != null || L.people[row.id]?.connected)) continue;
    if (f.viewed && !viewers.has(row.id)) continue;
    if (f.engaged && !idx.has(row.id)) continue;
    if (f.jobChange || f.posted || f.follows || f.shared) {
      const t = truthOf(state, person);
      if (f.jobChange && !t.jobChanged90) continue;
      if (f.posted && !t.posted30) continue;
      if (f.shared && !t.sharedExp) continue;
      if (f.follows && !followsCompany(state, person, t)) continue;
    }
    total++;
    if (out.length < limit) out.push(person);
  }
  return { people: out, total };
}

/** What LinkedIn shows about a person in a list (badges). Profile details need viewProfile. */
export function visibleFlags(state, person) {
  const L = ensureLinkedin(state);
  const t = truthOf(state, person);
  const nav = Boolean(L.salesNav);
  const e = engagerIndex(state).get(person.id);
  const viewer = L.viewers.find((v) => v.id === person.id && v.day > state.day - 90);
  return {
    engaged: e ? { how: e.comment ? 'commented on' : 'reacted to', competitor: e.competitor, postId: e.postId } : null,
    viewedYou: viewer ? viewer.day : null,
    jobChange: nav && t.jobChanged90,
    posted: nav && t.posted30,
    shared: nav ? t.sharedExp : null,
    follows: nav && followsCompany(state, person, t),
  };
}

/** The profile you see after viewing it: headline, recent activity, experience notes. */
export function profileOf(state, person) {
  const t = truthOf(state, person);
  const rec = ensureLinkedin(state).people[person.id];
  if (rec?.viewedDay == null) return null;
  return {
    headline: `${person.title} at ${person.companyName}`,
    activity: person.synthetic ? (person.kind === 'bot' ? 'Comments "Great insights! 🔥" on 40 posts a day' : person.kind === 'recruiter' ? 'Shares job openings' : 'Posts about their lead-gen product') : t.posted30 ? `Recently posted about ${t.topic}` : t.active ? 'Reacts to posts now and then; no posts of their own lately' : 'No activity in months',
    jobChange: t.jobChanged90 ? `Started this role ${Math.max(1, state.day - t.jobChangeDay)} days ago` : null,
    shared: t.sharedExp ? `You share: ${t.sharedExp}` : null,
    topic: t.posted30 ? t.topic : null,
  };
}

// ---------------------------------------------------------------------------
// Message judge (heuristic; the LLM judge in the UI can only refine tone, never the facts)
// ---------------------------------------------------------------------------

const PITCH = /\b(demo|book (a|some) (call|time|meeting)|quick call|15[- ]?min(ute)?s?|our (product|platform|tool|solution|software|app)|we help|i help companies|free trial|pricing|calendly|https?:\/\/|www\.|let me show you|schedule a)\b/i;
const GENERIC = /(i('d| would) (love|like) to (connect|add you)|expand(ing)? my (professional )?network|came across your profile|great to connect|hope (this|you) (finds|are)|i hope you('re| are) (well|doing well)|thanks for connecting|let'?s connect)/i;
const CLAIM_JOB = /\b(congrat\w*|new role|new position|recently joined|just joined|started at|new job)\b/i;
const CLAIM_POST = /\b(your (recent )?(post|article|comment)|you (wrote|posted|shared))\b/i;
const CLAIM_ENGAGED = /\b((liked|commented on|reacted to|engaged with) my post|thanks for (liking|the like|commenting|engaging|your comment))\b/i;
const CLAIM_SHARED = /\b(we both|fellow (alum|alumni|alumnus)|also (went|worked|studied)|same (school|university|company))\b/i;
const CREEPY = /\b(viewed my profile|(checked|checking) out my profile|saw you (viewed|visited|looked)|noticed you (viewed|visited)|saw you (liked|commented on|reacted to) (a|the|their|\w+'s) post)\b/i;

const shingles = (t) => { const w = String(t).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean); const s = new Set(); for (let i = 0; i + 2 < w.length; i++) s.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`); if (w.length < 3 && w.length) s.add(w.join(' ')); return s; };
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
function normalizeForTemplate(text, person) {
  let t = String(text);
  for (const v of [person.first, person.name, person.companyName, person.title]) if (v) t = t.split(v).join(' ');
  return t;
}

/**
 * Judge a note, DM, InMail or comment against what is TRUE about the person (hidden) and against your other sends.
 * Returns { q (0-1), specific, refTrue, falseClaim, pitch, generic, template, creepy, words, reasons[] }.
 */
export function judgeText(state, person, text, kind = 'note') {
  const L = ensureLinkedin(state);
  const t = truthOf(state, person);
  const s = String(text ?? '').trim();
  const words = s ? s.split(/\s+/).length : 0;
  const reasons = [];
  if (!s) return { q: kind === 'note' ? 0.45 : 0, specific: false, refTrue: false, falseClaim: false, pitch: false, generic: false, template: false, creepy: false, words: 0, reasons: ['no text'] };
  const tw = new Set(toks(s));
  const topicHit = t.posted30 && toks(t.topic).some((w) => tw.has(w));
  const eng = t.engaged;
  const engHit = eng && !eng.competitor && eng.postText && toks(eng.postText).filter((w) => tw.has(w)).length >= 2;
  let refTrue = false, falseClaim = false;
  if (CLAIM_JOB.test(s)) { if (t.jobChanged90) refTrue = true; else { falseClaim = true; reasons.push('mentions a new role they do not have'); } }
  if (CLAIM_POST.test(s)) { if (t.posted30) refTrue ||= topicHit; else { falseClaim = true; reasons.push('mentions a post they never wrote'); } }
  if (CLAIM_ENGAGED.test(s)) { if (eng && !eng.competitor) refTrue = true; else { falseClaim = true; reasons.push('thanks them for engaging, but they did not engage with your post'); } }
  if (CLAIM_SHARED.test(s)) { if (t.sharedExp) refTrue = true; else { falseClaim = true; reasons.push('claims shared experience you do not have'); } }
  if (topicHit || engHit) refTrue = true;
  const creepy = CREEPY.test(s) || Boolean(eng?.competitor && /\b(competitor|their post|liked|reacted)\b/i.test(s));
  if (creepy) reasons.push('references tracking them (creepy)');
  const pitch = PITCH.test(s) || (kind === 'note' && /\b(product|software|platform|solution)\b/i.test(s));
  if (pitch) reasons.push(kind === 'note' ? 'pitch in the connection note' : 'pitches before there is interest');
  const generic = !refTrue && (GENERIC.test(s) || tw.size < 4);
  if (generic) reasons.push('could be sent to anyone');
  // Template detection: the same body (names stripped) as recent sends.
  const sh = shingles(normalizeForTemplate(s, person));
  const recent = L.log.filter((x) => x.sh && x.kind === kind).slice(-30);
  const similar = recent.filter((x) => jaccard(new Set(x.sh), sh) >= 0.7).length;
  const template = similar >= 3;
  if (template) reasons.push(`same template as ${similar} recent sends`);
  const limit = kind === 'note' ? 60 : kind === 'comment' ? 80 : 120;
  const short = words <= limit;
  if (!short) reasons.push('too long to read on a phone');
  const question = /\?/.test(s);
  let q = 0.4 + (refTrue ? 0.3 : 0) + (short ? 0.08 : -0.1) + (question && kind !== 'comment' ? 0.07 : 0);
  if (kind === 'comment') q += words >= 12 ? 0.1 : -0.2; // a real comment adds a point of view
  q -= (pitch ? 0.3 : 0) + (falseClaim ? 0.3 : 0) + (generic ? 0.15 : 0) + (template ? 0.15 : 0) + (creepy ? 0.15 : 0);
  return { q: +clamp(q, 0, 1).toFixed(2), specific: refTrue && !falseClaim, refTrue, falseClaim, pitch, generic, template, creepy, words, reasons, sh: [...sh].slice(0, 40) };
}

/** Optional LLM refinement of tone/relevance; facts and template checks stay with the heuristic. Offline: heuristic. */
export async function judgeWithLlm(llm, state, person, text, kind) {
  const h = judgeText(state, person, text, kind);
  if (!llm?.ask || !String(text ?? '').trim()) return h;
  const prof = profileOf(state, person);
  try {
    const res = await llm.ask({
      task: 'linkedin_message_judge',
      system: 'You are a busy B2B buyer reading a LinkedIn message from a stranger. Score how relevant and human it feels to YOU (0-1). A pitch, flattery or a template that could go to anyone scores low; a short note about something you actually did or care about scores high. Be strict: most messages are ignored.',
      prompt: `You: ${person.name}, ${person.title} at ${person.companyName}. ${prof?.activity ?? ''}\nMessage type: ${kind}\nMessage:\n${text}`,
      schema: { type: 'object', additionalProperties: false, required: ['relevance', 'why'], properties: { relevance: { type: 'number' }, why: { type: 'string' } } },
      temperature: 0.2, maxTokens: 200,
      fallback: () => ({ relevance: h.q, why: h.reasons.join('; ') || 'offline heuristic' }),
    });
    if (res.mock) return { ...h, mock: true };
    const rel = clamp(Number(res.data.relevance) || h.q, 0, 1);
    // Gates stay: a false claim, pitch or template can never be judged up past the heuristic ceiling.
    const ceiling = h.falseClaim || h.pitch || h.template ? h.q + 0.05 : 1;
    return { ...h, q: +Math.min(ceiling, 0.5 * h.q + 0.5 * rel).toFixed(2), llmWhy: res.data.why };
  } catch { return h; }
}

// ---------------------------------------------------------------------------
// Account health and limits
// ---------------------------------------------------------------------------

export function liWindow(state) {
  const L = ensureLinkedin(state);
  const recent = L.requests.filter((r) => r.day > state.day - 7).length;
  const decided = L.requests.filter((r) => r.status !== 'pending').slice(-40);
  const acc = decided.length >= 20 ? decided.filter((r) => r.status === 'accepted').length / decided.length : null;
  let limit = acc != null && acc < SALES.linkedin.lowAcceptance ? SALES.linkedin.reducedLimit : SALES.linkedin.weeklyLimit;
  limit = Math.round(limit * (L.health.limitCut ?? 1));
  const blocked = blockedReason(state);
  return { recent, limit, acceptance: acc, left: blocked ? 0 : Math.max(0, limit - recent), blocked };
}

export function blockedReason(state) {
  const H = ensureLinkedin(state).health;
  if (H.lostUntil != null && state.day < H.lostUntil) return `Your LinkedIn account was permanently restricted (day ${H.lastEventDay}). Outreach on LinkedIn is closed for months.`;
  if (H.restrictedUntil != null && state.day < H.restrictedUntil) return `LinkedIn has temporarily restricted your account until ${H.restrictedUntil - state.day} more day(s) pass.`;
  return null;
}

const reports30 = (L, day) => L.health.reports.filter((d) => d > day - 30).length;

// ---------------------------------------------------------------------------
// Actions (pure on state; the UI charges the returned hours with ctx.act)
// ---------------------------------------------------------------------------

function rec(state, person) {
  const L = ensureLinkedin(state);
  const r = (L.people[person.id] ??= {});
  r.snap ??= { ...person };
  return r;
}

function ensureContact(state, person) {
  if (person.contactId) return contactById(state, person.contactId);
  const r = rec(state, person);
  if (r.contactId) return contactById(state, r.contactId);
  const slug = `${person.first}-${(person.name.split(' ')[1] ?? '').toLowerCase()}-${hash(person.id).slice(0, 4)}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
  let added;
  try {
    added = addContact(state, { firstName: person.first, lastName: person.name.split(' ').slice(1).join(' '), email: '', title: person.title, company: person.companyName, domain: person.domain ?? '', industry: person.industry ?? person.segLabel, size: String(person.employees ?? ''), linkedin: `https://www.linkedin.com/in/${slug}`, notes: 'Found on LinkedIn' }, { source: 'linkedin', allowNoEmail: true });
  } catch { return null; }
  const { contact, company } = added;
  contact.li = { id: person.id, kind: person.kind };
  if (!person.synthetic && !company.prospect) company.prospect = { fit: person.fit, geo: person.geo, segLabel: person.segLabel, listId: null, savedDay: state.day, signal: null, reason: '' };
  if (!person.synthetic) { company.employees ??= person.employees; company.segmentId ??= person.segId; }
  if (person.wrongPersona) contact.prospect = { wrongPersona: true };
  r.contactId = contact.id;
  return contact;
}

/** Which intent signals this person carries right now (visible ones you could act on). */
export function signalsFor(state, person) {
  const L = ensureLinkedin(state);
  const t = truthOf(state, person);
  const r = L.people[person.id] ?? {};
  const s = [];
  if (t.engaged && !t.engaged.competitor) s.push(t.engaged.comment ? 'commented_your_post' : 'liked_your_post');
  if (t.engaged?.competitor) s.push('competitor_engager');
  if (L.viewers.some((v) => v.id === person.id && v.day > state.day - 30)) s.push('viewed_you');
  if (t.jobChanged90) s.push('job_change');
  if (r.commentDay != null && (r.commentQ ?? 0) >= 0.6) s.push('you_commented');
  if (t.sharedExp) s.push('shared');
  if (t.posted30 && r.viewedDay != null) s.push('posted_recently');
  return s;
}

function warmMult(sig) {
  let m = 1;
  if (sig.includes('commented_your_post')) m *= 1.35; else if (sig.includes('liked_your_post')) m *= 1.2;
  if (sig.includes('you_commented')) m *= 1.25;
  if (sig.includes('viewed_you')) m *= 1.15;
  if (sig.includes('shared')) m *= 1.2;
  return Math.min(1.45, m);
}

/**
 * Where a LinkedIn decision or reply lands in its wait distribution (core/timing.js timeline): how often they log
 * in (structural), how responsive they are, how warm you already are, whether they are in market, and how the note
 * reads. All [design]. Returns timeline factors.
 */
export function liWaitFactors(t, sig = [], j = null) {
  const engagedWithYou = sig.includes('commented_your_post') || sig.includes('liked_your_post');
  const warm = sig.some((x) => ['you_commented', 'viewed_you', 'shared', 'job_change'].includes(x));
  const resp = t.responsiveness ?? 1;
  return [
    t.active ? null : { label: 'rarely on LinkedIn: sees it when they next log in', speed: 2.5 },
    { label: resp >= 1.2 ? 'quick to respond' : resp <= 0.8 ? 'slow to respond' : '', pull: +((1 - resp) * 0.8).toFixed(2) },
    engagedWithYou ? { label: 'already engaged with your posts', pull: -0.5 } : warm ? { label: 'warm signal', pull: -0.25 } : null,
    t.inMarket ? { label: 'in market this quarter', pull: -0.3 } : null,
    !j ? null : j.pitch ? { label: 'reads like a pitch', pull: 0.4 } : j.falseClaim ? { label: 'references something untrue', pull: 0.3 } : j.template ? { label: 'template note', pull: 0.2 } : j.specific ? { label: 'specific, true note', pull: -0.2 } : null,
  ].filter(Boolean);
}
/** The day a LinkedIn decision lands (never today: they have to see it first). */
const liDecideDay = (state, key, t, sig, j) => Math.max(state.day + 1, salesTimeline(state, key, liWaitFactors(t, sig, j)).day);

export function viewProfile(state, id) {
  const person = personOf(state, id);
  if (!person) throw new Error('Person not found.');
  const r = rec(state, person);
  const first = r.viewedDay == null;
  r.viewedDay = state.day;
  // A profile view is a visible touch: some active people look back (and land in your "viewed your profile" list).
  const t = truthOf(state, person);
  if (first && t.active && !person.synthetic && chance(state, 0.12)) ensureLinkedin(state).viewers.push({ id: person.id, day: state.day + 1, why: 'you viewed their profile' });
  return { hours: LI.hours.view, profile: profileOf(state, person) };
}

export function commentOn(state, id, text) {
  const person = personOf(state, id);
  const r = rec(state, person);
  if (r.viewedDay == null) throw new Error('Open their profile first to find their recent post.');
  const t = truthOf(state, person);
  if (!t.posted30) throw new Error('They have not posted anything recently to comment on.');
  const j = judgeText(state, person, text, 'comment');
  r.commentDay = state.day;
  r.commentQ = j.q;
  if (j.pitch) r.annoyed = true;
  if (j.q >= 0.6 && t.active && chance(state, 0.3)) ensureLinkedin(state).viewers.push({ id: person.id, day: state.day + 1, why: 'your comment on their post' });
  logSend(state, { kind: 'comment', person, t, j, hours: LI.hours.comment, signals: signalsFor(state, person) });
  return { hours: LI.hours.comment, judge: j };
}

export function saveLead(state, id) {
  const person = personOf(state, id);
  const r = rec(state, person);
  r.saved = !r.saved;
  return { hours: LI.hours.save, saved: r.saved };
}

function logSend(state, { kind, person, t, j, hours, signals, auto = false }) {
  const L = ensureLinkedin(state);
  L.log.push({ day: state.day, kind, id: person.id, fit: person.fit ?? 0, active: t.active, inMarket: t.inMarket, engagerKind: t.engaged ? (t.engaged.icp ? 'icp' : t.engaged.kind ?? 'other') : null, signal: signals.length > 0, signals, q: j?.q ?? null, pitch: Boolean(j?.pitch), template: Boolean(j?.template), falseClaim: Boolean(j?.falseClaim), creepy: Boolean(j?.creepy), specific: Boolean(j?.specific), auto, hours, sh: j?.sh ?? null });
  if (L.log.length > 1500) L.log.splice(0, L.log.length - 1500);
  // Only recent sends are compared for templates: drop the shingles of older entries to keep the save small.
  for (let i = L.log.length - 121; i >= 0 && L.log[i].sh; i--) L.log[i].sh = null;
}

/** Send a connection request (with an optional note). */
export function sendConnect(state, id, note = '', { auto = false, judge = null } = {}) {
  const L = ensureLinkedin(state);
  const w = liWindow(state);
  if (w.blocked) throw new Error(w.blocked);
  if (!w.left) throw new Error(`Weekly invitation limit reached (${w.limit}). Wait a few days.`);
  const person = personOf(state, id);
  if (!person) throw new Error('Person not found.');
  const r = rec(state, person);
  if (r.connected) throw new Error('Already connected.');
  if (r.requestedDay != null && L.requests.some((x) => x.personId === person.id && x.status === 'pending')) throw new Error('A request is already pending.');
  const max = L.salesNav ? LI.noteChars.nav : LI.noteChars.free;
  note = String(note ?? '').trim().slice(0, max);
  const t = truthOf(state, person);
  const sig = signalsFor(state, person);
  const j = judge ?? judgeText(state, person, note, 'note');
  let p = t.active ? LI.acceptActive : LI.acceptInactive;
  p *= 0.85 + 0.3 * clamp(person.fit ?? 0.3, 0, 1);
  p *= warmMult(sig);
  if (note) {
    if (j.pitch) p *= 0.65;
    else if (j.falseClaim) p *= 0.6;
    else if (j.specific) p *= 1.1;
    else if (j.template || j.generic) p *= 0.92;
  }
  if (j.creepy) p *= 0.8;
  if (r.annoyed) p *= 0.5;
  if (auto) p *= 0.85; // [design] machine timing, no profile warm-up
  if (person.kind === 'bot') p = 0.9; // bots accept everyone
  if (person.kind === 'recruiter' || person.kind === 'vendor') p = Math.max(p, 0.6);
  const contact = ensureContact(state, person);
  const req = { id: uid('li'), v2: true, personId: person.id, contactId: contact?.id ?? null, day: state.day, note, status: 'pending', pAccept: clamp(p, 0.02, 0.9), decideDay: liDecideDay(state, 'li.connect.decide', t, sig, note ? j : null), judge: { q: j.q, pitch: j.pitch, template: j.template, falseClaim: j.falseClaim, specific: j.specific }, auto };
  L.requests.push(req);
  r.requestedDay = state.day;
  if (contact) { contact.lastContactDay = state.day; addActivity(state, { type: 'linkedin', text: `LinkedIn connection request${note ? ` with note: "${note}"` : ''}${auto ? ' (automation)' : ''}`, companyId: contact.companyId, contactId: contact.id }); }
  const hours = auto ? 0 : note ? LI.hours.note : LI.hours.connect;
  logSend(state, { kind: 'note', person, t, j: note ? j : { q: 0.45 }, hours, signals: sig, auto });
  return { hours, request: req, judge: j };
}

function replyOdds(state, person, t, j, sig, channel) {
  let p = (channel === 'inmail' ? LI.inmailReply : LI.replyBase) * (t.active ? 1 : 0.25) * t.responsiveness;
  if (sig.includes('commented_your_post') || sig.includes('liked_your_post')) p *= j.specific ? LI.engagedReplyLift : 1.6;
  else p *= warmMult(sig);
  if (t.inMarket) p *= 2;
  p *= 0.6 + 0.6 * clamp(person.fit ?? 0.3, 0, 1);
  p *= j.specific ? 1.4 : j.generic ? 0.8 : 1;
  if (j.pitch) p *= 0.55;
  if (j.template) p *= 0.7;
  if (j.falseClaim) p *= 0.45;
  if (j.creepy) p *= 0.75;
  if (j.words > 150) p *= 0.7;
  if (person.synthetic) p = person.kind === 'vendor' ? 0.5 : person.kind === 'recruiter' ? 0.15 : 0.05; // vendors reply to pitch you back
  return clamp(p, 0, 0.6);
}

/** Message a connection (optionally as a voice note from the mobile app). */
export function sendDm(state, id, text, { voice = false, judge = null } = {}) {
  const L = ensureLinkedin(state);
  const blocked = blockedReason(state);
  if (blocked) throw new Error(blocked);
  const person = personOf(state, id);
  const r = rec(state, person);
  const contact = ensureContact(state, person);
  if (!r.connected && !contact?.linkedinConnected) throw new Error('You can only message connections. Connect first, or use InMail (Sales Navigator).');
  if (!String(text ?? '').trim()) throw new Error('Write the message first.');
  const t = truthOf(state, person);
  const sig = signalsFor(state, person);
  const j = judge ?? judgeText(state, person, text, 'dm');
  let p = replyOdds(state, person, t, j, sig, 'dm');
  if (voice && !j.pitch) p *= 1.15; // [design] a voice note feels human when the content is
  r.dms = (r.dms ?? 0) + 1;
  if (r.dms > 1) p *= 0.6; // follow-ups convert less
  const m = { id: uid('dm'), v2: true, personId: person.id, contactId: contact?.id ?? null, day: state.day, body: text, quality: j.q, pReply: clamp(p, 0, 0.6), status: 'sent', decideDay: liDecideDay(state, 'li.dm.reply', t, sig, j), judge: { q: j.q, pitch: j.pitch, specific: j.specific }, channel: 'dm' };
  L.messages.push(m);
  if (contact) { contact.lastContactDay = state.day; addActivity(state, { type: 'linkedin', text: `Sent LinkedIn ${voice ? 'voice note' : 'message'}`, companyId: contact.companyId, contactId: contact.id }); }
  const hours = voice ? LI.hours.voice : LI.hours.dm;
  logSend(state, { kind: 'dm', person, t, j, hours, signals: sig });
  return { hours, message: m, judge: j };
}

/** InMail (Sales Navigator credits): reach someone you are not connected to. */
export function sendInMail(state, id, text, { judge = null } = {}) {
  const L = ensureLinkedin(state);
  const blocked = blockedReason(state);
  if (blocked) throw new Error(blocked);
  if (!L.salesNav) throw new Error('InMail needs Sales Navigator.');
  refreshCredits(state);
  if (L.inmail.credits <= 0) throw new Error('No InMail credits left this month.');
  if (!String(text ?? '').trim()) throw new Error('Write the InMail first.');
  const person = personOf(state, id);
  const r = rec(state, person);
  const t = truthOf(state, person);
  const sig = signalsFor(state, person);
  const j = judge ?? judgeText(state, person, text, 'inmail');
  const contact = ensureContact(state, person);
  L.inmail.credits--;
  r.inmails = (r.inmails ?? 0) + 1;
  const m = { id: uid('im'), v2: true, personId: person.id, contactId: contact?.id ?? null, day: state.day, body: text, quality: j.q, pReply: replyOdds(state, person, t, j, sig, 'inmail'), status: 'sent', decideDay: liDecideDay(state, 'li.inmail.reply', t, sig, j), judge: { q: j.q, pitch: j.pitch, specific: j.specific }, channel: 'inmail' };
  L.messages.push(m);
  if (contact) { contact.lastContactDay = state.day; addActivity(state, { type: 'linkedin', text: 'Sent LinkedIn InMail', companyId: contact.companyId, contactId: contact.id }); }
  logSend(state, { kind: 'inmail', person, t, j, hours: LI.hours.inmail, signals: sig });
  return { hours: LI.hours.inmail, message: m, judge: j };
}

function refreshCredits(state) {
  const L = ensureLinkedin(state);
  const mk = `${Math.floor(state.day / 30)}`;
  if (L.salesNav && L.inmail.month !== mk) { L.inmail.credits = LI.inmailCredits; L.inmail.month = mk; }
}

export function setSalesNav(state, on) {
  const L = ensureLinkedin(state);
  if (on && !L.salesNav) {
    post(state, { amount: -SALES.linkedin.salesNavMonthly, counterparty: 'LinkedIn', description: 'Sales Navigator Core, first month', category: 'software', method: 'card' });
    L.salesNav = true;
    L.navRecurringId = addRecurring(state, { vendor: 'LinkedIn Sales Navigator', amount: SALES.linkedin.salesNavMonthly, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(state)) }).id;
    L.inmail.month = null;
    refreshCredits(state);
  } else if (!on && L.salesNav) {
    L.salesNav = false;
    const r = state.recurring?.find((x) => x.id === L.navRecurringId);
    if (r) r.active = false;
  }
}

export function saveSearch(state, name, filters, alert = true) {
  const L = ensureLinkedin(state);
  if (!L.salesNav) throw new Error('Saved searches and alerts need Sales Navigator.');
  L.savedSearches.push({ id: uid('lss'), name: name || `Search ${L.savedSearches.length + 1}`, filters: { ...filters }, alert, day: state.day });
  return { hours: LI.hours.alert };
}

/** Automation tool (Expandi/Dripify-style): sends connection requests with a template note to a saved filter, no founder hours. */
export function setAutomation(state, { on, perDay = 20, note = '', filters = null } = {}) {
  const L = ensureLinkedin(state);
  const A = L.auto;
  if (on && !A.on) {
    post(state, { amount: -LI.autoMonthly, counterparty: 'LinkedIn automation tool', description: 'Automation tool, first month', category: 'software', method: 'card' });
    A.recurringId = addRecurring(state, { vendor: 'LinkedIn automation tool', amount: LI.autoMonthly, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(state)) }).id;
    A.startedDay = state.day;
  }
  if (!on && A.on) { const r = state.recurring?.find((x) => x.id === A.recurringId); if (r) r.active = false; }
  Object.assign(A, { on: Boolean(on), perDay: clamp(Number(perDay) || 20, 1, 100), note: String(note ?? ''), filters: filters ?? A.filters ?? { ...LI_FILTERS } });
  return { hours: on ? LI.hours.autoSetup : 0 };
}

// ---------------------------------------------------------------------------
// Daily simulation
// ---------------------------------------------------------------------------

export function linkedinProspectingDay(state) {
  const o = state.apps.outreach;
  if (!o?.linkedin) return;
  const L = ensureLinkedin(state);
  refreshCredits(state);
  decideRequests(state, L);
  decideMessages(state, L);
  if (!isWeekend(state)) automationDay(state, L);
  viewersDay(state, L);
  alertsDay(state, L);
  restrictionDay(state, L);
  if (state.day % 7 === 0) weeklyMistakes(state, L);
}

function decideRequests(state, L) {
  for (const r of L.requests) {
    if (!r.v2 || r.status !== 'pending' || r.decideDay > state.day) continue;
    const person = personOf(state, r.personId);
    const pr = L.people[r.personId] ?? {};
    if (chance(state, r.pAccept)) {
      r.status = 'accepted';
      pr.connected = true;
      const ct = r.contactId ? contactById(state, r.contactId) : null;
      if (ct) { ct.linkedinConnected = true; addActivity(state, { type: 'linkedin', text: 'Accepted your LinkedIn connection request', companyId: ct.companyId, contactId: ct.id }); }
    } else {
      r.status = 'ignored';
      // Some ignored requests are reported ("I don't know this person"): pitches, templates and strangers outside your market.
      const t = person ? truthOf(state, person) : { active: false };
      if (t.active) {
        const pRep = 0.008 + (r.judge?.pitch ? 0.08 : 0) + (r.judge?.template ? 0.05 : 0) + (r.judge?.falseClaim ? 0.05 : 0) + ((person?.fit ?? 0) < 0.3 ? 0.04 : 0) + (r.auto ? 0.03 : 0);
        if (chance(state, pRep)) L.health.reports.push(state.day);
      }
    }
  }
}

function decideMessages(state, L) {
  for (const m of L.messages) {
    if (!m.v2 || m.status !== 'sent' || m.decideDay > state.day) continue;
    m.status = 'done';
    const ct = m.contactId ? contactById(state, m.contactId) : null;
    const person = personOf(state, m.personId);
    if (!ct || !person) continue;
    if (ct.replyKind && ct.replyKind !== 'ooo') continue;
    if (chance(state, m.pReply)) {
      m.replied = true;
      const t = truthOf(state, person);
      if (person.synthetic) { m.replyKindSyn = person.kind; L.people[person.id].noise = (L.people[person.id].noise ?? 0) + 1; continue; } // a recruiter / vendor pitch back: not pipeline
      let pPos = clamp(0.25 + 0.3 * (m.quality ?? 0.5) + (t.inMarket ? 0.25 : 0) + 0.2 * ((person.fit ?? 0.3) - 0.5), 0.05, 0.85);
      if (m.judge?.pitch && !t.inMarket) pPos *= 0.6;
      const kind = replyKind(pPos, rng(state), rng(state), prospectPain(state, ct));
      m.kind = kind;
      if (m.channel === 'inmail') L.inmail.credits = Math.min(LI.inmailCredits * 3, L.inmail.credits + 1); // credit back on reply within 90 days
      recordReply(state, { contact: ct, kind, source: 'linkedin', channel: 'linkedin', subject: m.channel === 'inmail' ? 'LinkedIn InMail' : 'LinkedIn message', body: m.body });
    } else if (m.judge?.pitch && (person.fit ?? 0) < 0.3 && chance(state, 0.04)) L.health.reports.push(state.day);
  }
}

function automationDay(state, L) {
  const A = L.auto;
  if (!A.on || blockedReason(state)) return;
  let n = Math.min(A.perDay, liWindow(state).left);
  if (n <= 0) return;
  const { people } = searchPeople(state, { ...LI_FILTERS, ...(A.filters ?? {}), jobChange: false, posted: false, follows: false, shared: false, excludeContacted: true }, { limit: n });
  for (const person of people) {
    const note = String(A.note ?? '').replace(/\{\{\s*firstName\s*\}\}/g, person.first).replace(/\{\{\s*company\s*\}\}/g, person.companyName);
    try { sendConnect(state, person.id, note, { auto: true }); A.sent++; } catch { break; }
  }
  A.lastDay = state.day;
  A.todaySent = people.length;
}

function viewersDay(state, L) {
  // People look at your profile after your posts and visible activity [design]: a few per day from engagers, a trickle
  // of strangers (mostly recruiters and vendors).
  const posts = yourPosts(state, { days: 3 });
  const r = prng(`viewers|${worldKey(state)}|${state.day}`);
  for (const { engagers } of posts) {
    for (const e of engagers) if (r() < 0.08) L.viewers.push({ id: e.id, day: state.day, why: 'engaged with your post' });
  }
  const P = pools(state);
  const base = Math.min(3, (state.founder?.network?.linkedin ?? 0) / 1500);
  for (let i = 0; i < Math.floor(base + r()); i++) {
    const u = r();
    const id = u < 0.5 ? `lix_${u < 0.25 ? 'recruiter' : 'vendor'}_${hash(`${state.day}|${i}`)}` : (u < 0.65 && P.buyers.length ? P.buyers : P.others)[Math.floor(r() * (u < 0.65 ? P.buyers.length : P.others.length))]?.id;
    if (id) L.viewers.push({ id, day: state.day, why: 'browsing' });
  }
  if (L.viewers.length > 300) L.viewers.splice(0, L.viewers.length - 300);
}

function alertsDay(state, L) {
  if (!L.salesNav) return;
  for (const [id, pr] of Object.entries(L.people)) {
    if (!pr.saved) continue;
    const person = personOf(state, id);
    if (!person || person.synthetic) continue;
    const t = truthOf(state, person);
    if (t.jobChangeDay === state.day) L.alerts.push({ day: state.day, id, kind: 'job_change', text: `${person.name} started a new role` });
    if (t.posted30 && prng(`postalert|${worldKey(state)}|${id}|${state.day}`)() < 0.05) L.alerts.push({ day: state.day, id, kind: 'posted', text: `${person.name} posted about ${t.topic}` });
  }
  if (L.alerts.length > 200) L.alerts.splice(0, L.alerts.length - 200);
}

/** Daily restriction hazard from automation, reports and low acceptance [design]. */
export function restrictionHazard(state) {
  const L = ensureLinkedin(state);
  const w = liWindow(state);
  let h = 0;
  if (L.auto.on) h += 0.012 * (L.auto.perDay / 15);
  h += 0.004 * Math.max(0, reports30(L, state.day) - 2); // a couple of reports a month is normal noise
  if (w.acceptance != null && w.acceptance < 0.2) h += 0.015;
  const today = L.log.filter((x) => x.day === state.day && x.kind === 'note').length;
  if (today > 40) h += 0.03;
  return clamp(h, 0, 0.5);
}

function restrictionDay(state, L) {
  const H = L.health;
  if (H.lostUntil != null && state.day < H.lostUntil) return;
  if (H.level > 0 && H.lastEventDay != null && state.day - H.lastEventDay > 60) { H.level--; H.lastEventDay = state.day; } // slowly forgiven
  if (blockedReason(state)) return;
  const h = restrictionHazard(state);
  if (!h || !chance(state, h)) return;
  H.level++;
  H.lastEventDay = state.day;
  H.events.push({ day: state.day, level: H.level });
  const why = `${L.auto.on ? 'automation tool running, ' : ''}${reports30(L, state.day)} "I don't know this person" report(s) in 30 days${liWindow(state).acceptance != null ? `, acceptance ${Math.round(liWindow(state).acceptance * 100)}%` : ''}`;
  if (H.level === 1) {
    H.restrictedUntil = state.day + 2;
    logMistake(state, { functionId: 'linkedin_prospecting', id: 'li_warning', label: 'LinkedIn flagged unusual activity', cost: { hours: 0.5, days: 2 }, detail: `LinkedIn asked you to verify your identity and paused invitations for 2 days (${why}).`, app: 'outreach', key: `liwarn:${state.day}`, charge: true });
  } else if (H.level === 2) {
    const d = Math.max(3, Math.round(salesTimeline(state, 'li.restriction', [{ label: L.auto.on ? 'automation tool running' : '', pull: L.auto.on ? 0.4 : 0 }, { label: 'prior warnings', pull: H.events.length > 2 ? 0.3 : 0 }]).days));
    H.restrictedUntil = state.day + d;
    H.limitCut = 0.6;
    for (const r of L.requests) if (r.v2 && r.status === 'pending') r.status = 'withdrawn';
    logMistake(state, { functionId: 'linkedin_prospecting', id: 'li_restricted', label: 'LinkedIn account temporarily restricted', cost: { hours: 2, days: d, reputation: 1 }, detail: `Account restricted for ${d} days and pending invitations withdrawn (${why}). Your weekly invitation limit stays lower afterwards.`, app: 'outreach', key: `lirestrict:${state.day}`, charge: true });
  } else {
    H.lostUntil = state.day + 180;
    for (const r of L.requests) if (r.v2 && r.status === 'pending') r.status = 'withdrawn';
    if (L.auto.on) setAutomation(state, { on: false });
    logMistake(state, { functionId: 'linkedin_prospecting', id: 'li_account_lost', label: 'LinkedIn account permanently restricted', cost: { hours: 4, days: 180, reputation: 3 }, detail: `After repeated restrictions LinkedIn closed the account (${why}). Your connections, conversations and the channel are gone for about six months.`, app: 'outreach', key: `lilost:${state.day}`, charge: true });
  }
}

function weeklyMistakes(state, L) {
  const wk = L.log.filter((x) => x.day > state.day - 7 && x.day <= state.day);
  const key = Math.floor(state.day / 7);
  const sumH = (a) => +a.reduce((s, x) => s + (x.hours ?? 0), 0).toFixed(2);
  const pitchNotes = wk.filter((x) => x.kind === 'note' && x.pitch);
  if (pitchNotes.length >= 3) logMistake(state, { functionId: 'linkedin_prospecting', id: 'pitch_in_connection_note', label: 'Pitching in the connection note', cost: { hours: sumH(pitchNotes), reputation: pitchNotes.length >= 15 ? 1 : 0.5 }, detail: `${pitchNotes.length} connection notes this week pitched the product. Pitch notes are accepted about half as often and get reported, which lowers your limit.`, app: 'outreach', key: `lipitch:${key}` });
  const junk = wk.filter((x) => x.engagerKind && !['icp'].includes(x.engagerKind) && (x.kind === 'dm' || x.kind === 'note' || x.kind === 'inmail'));
  if (junk.length >= 5) logMistake(state, { functionId: 'linkedin_prospecting', id: 'mass_dm_likers', label: 'Messaging everyone who liked a post', cost: { hours: sumH(junk), reputation: 0.25 }, detail: `${junk.length} of this week's LinkedIn touches went to engagers who are not buyers (recruiters, pod bots, vendors, peers). Their replies are pitches back, not pipeline.`, app: 'outreach', key: `lilikers:${key}` });
  const tmpl = wk.filter((x) => x.template);
  if (tmpl.length >= 10) logMistake(state, { functionId: 'linkedin_prospecting', id: 'li_template_blast', label: 'Same LinkedIn template to everyone', cost: { hours: sumH(tmpl), reputation: 0.5 }, detail: `${tmpl.length} sends this week were the same text with the name swapped. Acceptance and replies drop and reports rise.`, app: 'outreach', key: `litmpl:${key}` });
  const fake = wk.filter((x) => x.falseClaim || x.creepy);
  if (fake.length >= 2) logMistake(state, { functionId: 'linkedin_prospecting', id: 'fake_personalization', label: 'Personalization that is not true (or is creepy)', cost: { reputation: 1, hours: sumH(fake) }, detail: `${fake.length} messages this week referenced things that were not true about the person, or that they were being tracked.`, app: 'outreach', key: `lifake:${key}` });
  // Warm engagers left waiting while you sent cold requests.
  const cold = wk.filter((x) => !x.signal && (x.kind === 'note' || x.kind === 'dm' || x.kind === 'inmail'));
  if (cold.length >= 10) {
    const idx = engagerIndex(state);
    const waiting = [...idx.entries()].filter(([id, e]) => e.icp && !e.competitor && e.day >= state.day - 14 && e.day <= state.day - 5 && L.people[id]?.requestedDay == null && !L.people[id]?.dms && !L.people[id]?.viewedDay);
    if (waiting.length >= 2) logMistake(state, { functionId: 'linkedin_prospecting', id: 'ignored_warm_engagers', label: 'Ignoring warm engagers while sending cold', cost: { hours: Math.max(0.5, sumH(cold)) }, detail: `${waiting.length} buyers in your market engaged with your posts in the last two weeks and heard nothing, while ${cold.length} cold requests went out.`, app: 'outreach', key: `liwarm:${key}` });
  }
}

// ---------------------------------------------------------------------------
// Stats for the UI and reader
// ---------------------------------------------------------------------------

export function liStats(state, days = 90) {
  const L = ensureLinkedin(state);
  const reqs = L.requests.filter((r) => r.v2 && r.day > state.day - days);
  const decided = reqs.filter((r) => r.status === 'accepted' || r.status === 'ignored');
  const msgs = L.messages.filter((m) => m.v2 && m.day > state.day - days);
  const done = msgs.filter((m) => m.status === 'done');
  const replies = done.filter((m) => m.replied && !m.replyKindSyn);
  const positive = replies.filter((m) => m.kind === 'interested' || m.kind === 'curious');
  const hours = L.log.filter((x) => x.day > state.day - days).reduce((a, x) => a + (x.hours ?? 0), 0);
  return { requests: reqs.length, decided: decided.length, accepted: decided.filter((r) => r.status === 'accepted').length, acceptance: decided.length ? decided.filter((r) => r.status === 'accepted').length / decided.length : null, messages: msgs.length, answered: done.length, replies: replies.length, replyRate: done.length ? replies.length / done.length : null, positive: positive.length, noise: done.filter((m) => m.replyKindSyn).length, hours: +hours.toFixed(2) };
}

export { SENIORITY };
