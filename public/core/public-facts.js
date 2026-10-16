// What the outside world can truthfully say about the company, and a deterministic check that keeps inbound senders
// (offline templates and LLM-written messages) from claiming news the founder never made public.
//
// Bug this fixes: founders who had raised nothing got "congrats on the Series A" emails. Causes: an offline vendor
// template that always congratulated "the recent raise", archetype prompt hints and red flags that told the model to
// open with "the founder's funding news" / "the wrong round" whatever the state, and a public-activity list that
// showed a raise only as "funding announced" with no round name (so the model guessed Series A). The rule now:
//   - a sender may mention a raise only after `funding_announced` was recorded (a closed, announced round), and then
//     only with the round that was announced (seed stays seed);
//   - a launch only once the product is live (Product Hunt / Show HN only when that launch happened);
//   - an MRR or revenue post only after the founder posted one; a hiring post only after a public job post.
// `scrubClaims` enforces it after generation: sentences that claim unannounced news are dropped and a wrong round
// name is corrected. Pure string work on state; no RNG draws.

import { ensureNetwork } from './network.js';
import { hasProduct } from './market.js';

const STAGE_LABEL = { 'pre-seed': 'pre-seed round', seed: 'seed round', 'series-a': 'Series A', 'series-b': 'Series B', accelerator: 'accelerator round' };

function lastEvent(state, type) {
  const n = ensureNetwork(state);
  let e = null;
  for (const x of n.publicEvents ?? []) if (x.type === type && x.day <= state.day && (!e || x.day >= e.day)) e = x;
  if (!e && n.lastSeen?.[type] != null && n.lastSeen[type] <= state.day) e = { type, day: n.lastSeen[type], meta: n.lastMeta?.[type] ?? {} };
  return e;
}

// Round stage of an announcement: from the event (new saves) or the fundraising round closed that day (old saves).
function announcedStage(state, e) {
  if (e.meta?.stage) return e.meta.stage;
  const rounds = state.apps?.fundraising?.rounds ?? [];
  const r = rounds.filter((x) => x.day <= e.day && x.instrument !== 'safe').at(-1);
  if (!r) return null;
  return r.instrument === 'accelerator' ? 'accelerator' : r.stage ?? null;
}

/** Public facts a stranger can know, with the round that was announced (if any). */
export function publicFacts(state) {
  const fund = lastEvent(state, 'funding_announced');
  const stage = fund ? announcedStage(state, fund) : null;
  const ph = lastEvent(state, 'product_hunt_launch');
  const hn = lastEvent(state, 'show_hn');
  const store = lastEvent(state, 'app_store_feature');
  const organicLaunch = state.apps?.organic?.launch ?? null;
  const raising = lastEvent(state, 'fundraise_started');
  const raiseOpen = Boolean(state.apps?.fundraising?.raise);
  return {
    funding: fund ? { day: fund.day, amount: fund.meta?.amount ?? null, stage, label: (fund.meta?.label ?? STAGE_LABEL[stage]) || 'funding round', program: fund.meta?.program ?? null } : null,
    raising: raising && raiseOpen ? { stage: raising.meta?.stage ?? null } : null,
    launched: hasProduct(state) || Boolean(ph || hn || store || organicLaunch),
    productHunt: Boolean(ph),
    showHn: Boolean(hn),
    revenuePosted: Boolean(lastEvent(state, 'revenue_milestone_posted')),
    hiringPost: Boolean(lastEvent(state, 'hiring_post')),
    press: Boolean(lastEvent(state, 'press_coverage')),
  };
}

const usd = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}k`);

/** One line for LLM prompts: what is and is not public, stated as hard facts. */
export function publicFactsLine(state) {
  const f = publicFacts(state);
  const out = [];
  out.push(f.funding
    ? `Funding: publicly announced a ${f.funding.label}${f.funding.amount ? ` of ${usd(f.funding.amount)}` : ''}. If the sender mentions it, call it exactly "${f.funding.label}" (never another round name).`
    : `Funding: NO round has been announced. The company has not publicly raised money: never congratulate it on a raise, round, seed, Series A or funding${f.raising ? '; the founder has said they are raising (not closed)' : ''}.`);
  out.push(f.launched
    ? `Launch: the product is live${f.productHunt ? ' (launched on Product Hunt)' : ''}${f.showHn ? ' (posted a Show HN)' : ''}.${f.productHunt ? '' : ' It has not launched on Product Hunt.'}`
    : 'Launch: the product has NOT launched; do not congratulate a launch or mention a Product Hunt launch.');
  if (!f.revenuePosted) out.push('No MRR or revenue figure has been posted publicly.');
  if (!f.hiringPost) out.push('No public job post.');
  return `PUBLIC FACTS (hard limits): ${out.join(' ')}`;
}

// ---- Claim detection ----
const STAGE_RE = /\b(pre-?seed|seed|series\s+[a-e])(\s+round)?\b/i;
// A claim that the company raised or announced funding (the sender's own fund thesis is not a claim: "we invest at seed").
const FUNDING_CLAIMS = [
  /\bcongrat\w*[^.!?\n]{0,60}?\b(rais\w*|round|funding|funded|seed|series\s+[a-e]|investment|backing|capital)\b/i,
  /\b(your|{C}'s?)(\s+(recent|new|latest|fresh|big|successful|oversubscribed))?\s+((pre-?seed|seed|series\s+[a-e])(\s+round)?|raise|round|funding( round| news| announcement)?)\b/i,
  /\bthe\s+(recent|new|latest|fresh|big|successful|oversubscribed)\s+((pre-?seed|seed|series\s+[a-e])(\s+round)?|raise|round|funding)\b/i,
  /\b(you|you've|you have|{C}|they)\s+(just\s+|recently\s+)?(raised|closed (a|an|your|the)\b|secured (a|an|\$|funding)|landed (a|an)\s+[^.!?]{0,20}(round|investment)|got funded)/i,
  /\b(recent(ly)?|fresh|newly|just)\s+(raised|funded|closed)\b/i,
  /\b(funding|fundraising)\s+(news|announcement)\b/i,
  /\b(post-raise|after (your|the) (raise|round)|freshly funded|newly funded|well-funded team like yours)\b/i,
];
const LAUNCH_CLAIMS = [
  /\bcongrat\w*[^.!?\n]{0,40}?\blaunch\w*/i,
  /\b(saw|seen|noticed|loved|caught)\s+(your|the|{C}'s?)\s+(recent\s+|big\s+)?launch\b/i,
  /\b(your|the)\s+(recent\s+)?launch (today|this week|last week|yesterday|went)\b/i,
  /\b(you|{C}) (just |recently )?launched\b/i,
];
// Claims that the company launched there (offering launch services is not a claim).
const PH_CLAIMS = [
  /\b(your|the|{C}'s?|today's)\s+product\s*hunt\s+(launch|page|post|listing|rank\w*)\b/i,
  /\b(launched|launching|live|ranked|ranking|saw (you|{C})|found (you|{C})|came across (you|{C})|discovered (you|{C}))\s+(on|via|through)\s+product\s*hunt\b/i,
  /\bcongrat\w*[^.!?\n]{0,40}?\bproduct\s*hunt\b/i,
];
const HN_CLAIMS = [
  /\b(your|the|{C}'s?)\s+show\s*hn\b/i,
  /\b(saw|found|came across|read)\s+(you|{C}|your post)\s+(on|via)\s+(show\s*hn|hacker news)\b/i,
];
const MRR_CLAIMS = [
  /\b(your|the|{C}'s?)\s+(recent\s+)?(\$[\d.,]+\s*[kKmM]?\s+)?(mrr|revenue|arr)\s+(post|update|tweet|milestone|numbers?|thread)\b/i,
  /\byour\s+\$[\d.,]+\s*[kKmM]?\s+(mrr|arr)\b/i,
  /\b(hit|hitting|crossed|crossing|reached|passed)\s+\$[\d.,]+\s*[kKmM]?\s*(in\s+)?(mrr|arr|monthly)/i,
  /\bcongrat\w*[^.!?\n]{0,40}?\b(mrr|arr|revenue)\b/i,
];
const HIRING_CLAIMS = [
  /\b(saw|noticed|seen)\s+(that\s+)?(you('re| are)|{C} is)\s+hiring\b/i,
  /\b(your|the)\s+(open\s+(role|position)|job\s+(post|posting|ad|listing)|hiring\s+post)\b/i,
  /\bcongrat\w*[^.!?\n]{0,30}?\b(new\s+)?hire\b/i,
];

const withCompany = (re, name) => {
  const esc = String(name ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(re.source.replaceAll('{C}', esc || '(?!)'), re.flags);
};
const anyMatch = (res, text, name) => res.some((re) => withCompany(re, name).test(text));

// Sentences, keeping their terminators and line breaks so the cleaned text reads as written.
// A leading greeting ("Hi Pat, ") is its own piece so dropping a false first sentence keeps the salutation.
const GREETING = /^\s*((hi|hey|hello|dear|yo|hiya|hii+)\b[^,!.?\n]{0,40}[,!]\s*)/i;
const sentences = (text) => {
  const t = String(text ?? '');
  const g = t.match(GREETING)?.[1] ?? '';
  return [...(g ? [g] : []), ...(t.slice(g.length).match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [])];
};

/** Which unannounced claims a text makes (empty when truthful), checked sentence by sentence. */
export function falseClaims(state, text, facts = publicFacts(state)) {
  const out = new Set();
  for (const s of sentences(text)) for (const k of sentenceClaims(state, s, facts)) out.add(k);
  return [...out];
}

function sentenceClaims(state, t, facts) {
  const name = state.company?.name;
  const out = [];
  if (anyMatch(FUNDING_CLAIMS, t, name)) {
    if (!facts.funding) out.push('funding');
    else if (wrongStage(t, facts)) out.push('wrong_round');
  }
  if (!facts.launched && anyMatch(LAUNCH_CLAIMS, t, name)) out.push('launch');
  if (!facts.productHunt && anyMatch(PH_CLAIMS, t, name)) out.push('product_hunt');
  if (!facts.showHn && anyMatch(HN_CLAIMS, t, name)) out.push('show_hn');
  if (!facts.revenuePosted && anyMatch(MRR_CLAIMS, t, name)) out.push('mrr_post');
  if (!facts.hiringPost && anyMatch(HIRING_CLAIMS, t, name)) out.push('hiring_post');
  return out;
}

const normStage = (s) => s.toLowerCase().replace(/\s+round$/, '').replace(/\s+/g, '-').replace('preseed', 'pre-seed');
function wrongStage(sentence, facts) {
  const m = sentence.match(STAGE_RE);
  if (!m) return false;
  const said = normStage(m[1]);
  return facts.funding.stage == null || said !== facts.funding.stage;
}

/** Drop sentences claiming news the company never made public; correct a wrong round name in a claim about an
 *  announced round. Returns { text, removed: [{ kind, sentence }], changed }. */
export function scrubClaims(state, text, facts = publicFacts(state)) {
  const removed = [];
  const kept = [];
  for (const s of sentences(text)) {
    const kinds = sentenceClaims(state, s, facts);
    if (!kinds.length) { kept.push(s); continue; }
    if (kinds.length === 1 && kinds[0] === 'wrong_round') {
      // The raise is real and public: keep the sentence, fix the round name ("Series A" -> "seed round").
      const fixed = s.replace(new RegExp(STAGE_RE.source, 'i'), facts.funding.label);
      kept.push(fixed);
      removed.push({ kind: 'wrong_round', sentence: s.trim() });
      continue;
    }
    removed.push({ kind: kinds.join('+'), sentence: s.trim() });
  }
  let out = kept.join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  // A greeting left alone ("Hi Pat,") reads oddly but stays truthful; capitalise a lowered first letter.
  out = out.replace(/^([,;:\s]+)/, '');
  if (out) out = out[0].toUpperCase() + out.slice(1);
  if (GREETING.test(out) && out.replace(GREETING, '').trim() === '') out = ''; // nothing left but "Hi Pat,"
  // Greeting followed by a sentence that was lower-cased mid-line stays readable ("Hi Pat, teams like ..." is fine).
  return { text: out, removed, changed: removed.length > 0 };
}

/** Public facts plus what the founder personally told this sender in the thread (a founder who writes "we just closed
 *  our seed" has told them, so a reply may mention it). */
export function factsToldIn(state, founderText) {
  const f = { ...publicFacts(state) };
  const t = String(founderText ?? '');
  if (!f.funding && /\b(raised|closed|closing|wired|round)\b/i.test(t)) {
    const m = t.match(STAGE_RE);
    const stage = m ? normStage(m[1]) : null;
    f.funding = { stage, label: STAGE_LABEL[stage] ?? 'round', amount: null, day: state.day };
  }
  if (!f.launched && /\blaunch(ed|ing)?\b/i.test(t)) f.launched = true;
  return f;
}

/** Apply scrubClaims to an inbound message object ({ subject, message, ... }). Returns the cleaned copy. */
export function scrubInbound(state, msg, facts = publicFacts(state)) {
  if (!msg) return msg;
  const body = scrubClaims(state, msg.message, facts);
  const subj = scrubClaims(state, msg.subject ?? '', facts);
  return { ...msg, message: body.text, subject: subj.changed ? (subj.text || state.company?.name || '') : msg.subject, scrubbed: [...body.removed, ...subj.removed] };
}
