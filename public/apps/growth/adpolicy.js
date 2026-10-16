// Ad policy enforcement as the platforms actually run it (market-people.md §3.1):
//  1. Automated review at submission (minutes to 24h): obvious violations are usually caught right away. That is
//     the one realistically instant check, and it is probabilistic: [design] ~60% of policy-violating claims are
//     disapproved at submission (personal-attribute ads more, ~80%).
//  2. Post-approval sweeps and user reports while the ad delivers: about half of the violating ads that got through
//     are disapproved later ([design] 20% of all violating ads, within ~30 days of delivery).
//  3. Claims that need substantiation (health, finance/earnings, "guaranteed", "#1", "replaces your accountant")
//     are rarely blocked at submission but are what sweeps and reports flag.
//  4. Strikes compound: each disapproval is a strike on the account; with repeated strikes inside 90 days the account
//     is disabled (~35% per repeat strike [design]). Google's misrepresentation policy suspends "upon detection and
//     without prior warning" [S]. Appeals take 2-21 days [unverified agency figures] and succeed less for repeat
//     offenders [design]; a permanent ban means a new account with no pixel history or learning.
// The LLM judges grade the WRITING (growth/judges.js); this module decides what the platform does with it.

import { sideRoll } from '../../core/integrity.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';

export const AD_POLICY = {
  rules: [
    { id: 'personal_attributes', label: 'asserts personal attributes ("Are you...?")', re: /\b(are you|you're|you are)\s+(fat|overweight|depressed|broke|in debt|diabetic|anxious|lonely|bald|single|struggling with (your )?(weight|debt|anxiety))\b/, pSubmit: 0.8 },
    { id: 'guaranteed_outcome', label: 'unrealistic or guaranteed outcomes', re: /guarantee(d)?\s+(results|income|weight|money|returns?|approval)|get rich|lose \d+ ?(lbs|kg|pounds) in|risk[- ]free (returns|income)/, pSubmit: 0.6 },
    { id: 'earnings_claim', label: 'earnings or financial-return claims', re: /\b(earn|make)\s+\$?\d[\d,.]*\s?(k\b)?\s*(\/|per|a|every)\s*(day|week|month)\b|passive income|double your money|\d+% (monthly |guaranteed )?returns?\b/, pSubmit: 0.35, substantiate: true },
    { id: 'health_claim', label: 'health or medical claims', re: /\b(cures?|treats?|heals?|prevents?|reverses?)\b[^.]{0,30}\b(anxiety|depression|diabetes|adhd|insomnia|cancer|disease|obesity)\b|clinically proven|doctor[- ]approved|fda[- ]approved/, pSubmit: 0.3, substantiate: true },
    { id: 'unsubstantiated_superlative', label: 'unsubstantiated "#1"/"guaranteed" claims', re: /#1\b|number one\b|best in the world|100% guaranteed|world'?s (best|fastest)/, pSubmit: 0.1, substantiate: true },
    { id: 'misleading_ai', label: 'misleading AI capability claims', re: /\b(100%|fully|completely) (automated|accurate|error[- ]free)\b|replaces? (your )?(accountant|lawyer|doctor|therapist|entire team)/, pSubmit: 0.15, substantiate: true },
  ],
  laterFlagShare: 0.5, sweepWindowDays: 30, // half of what passes is flagged within ~30 days of delivery
  strikeWindowDays: 90, banPerRepeatStrike: 0.35,
  appealDays: [2, 21], appealSuccess: { first: 0.5, repeat: 0.15 }, rebuildDays: [7, 21],
  hours: { rewrite: 0.5, appeal: 2, rebuild: 6 },
};

/** Policy problems in a piece of ad copy (pure). */
export function policyScan(text) {
  const t = String(text ?? '').toLowerCase();
  return AD_POLICY.rules.filter((r) => r.re.test(t)).map((r) => ({ id: r.id, label: r.label, pSubmit: r.pSubmit, substantiate: Boolean(r.substantiate) }));
}

export function ensurePolicy(A) {
  A.policy ??= { strikes: [], history: [] };
  return A.policy;
}

const adCopy = (c) => `${c.hook ?? ''} ${c.primaryText ?? ''} ${c.headline ?? ''}`;

/**
 * Automated review at submission. Returns a rejection reason or null (approved). Approved violators carry
 * c.policy.violations for the later sweeps. Each rejection is a strike on every ad account you run.
 */
export function submissionReview(state, A, c) {
  const v = policyScan(adCopy(c));
  c.policy = { violations: v.map((x) => x.id), flagged: false, reviewedDay: state.day };
  if (!v.length) return null;
  const pReject = 1 - v.reduce((a, x) => a * (1 - x.pSubmit), 1);
  if (sideRoll(state, `adreview|${c.id}`) >= pReject) return null; // got through; the sweeps can still find it
  const reason = `Disapproved: ${v.map((x) => x.label).join('; ')}.`;
  logMistake(state, { functionId: 'paid_ads', id: 'ad_disapproved_submission', label: 'Ad disapproved at submission (policy)', app: 'ads', cost: { hours: AD_POLICY.hours.rewrite }, detail: `"${c.name}": ${v.map((x) => x.label).join('; ')}. Each disapproval is a strike on the ad account; repeated strikes get accounts disabled. Rewrite the claim so it describes what the product does, not what the viewer is or is guaranteed.` });
  for (const p of Object.keys(A.accounts ?? {})) strike(state, A, p, c, v.map((x) => x.id), 'submission');
  return reason;
}

function strike(state, A, p, c, rules, stage) {
  const P = ensurePolicy(A);
  P.strikes.push({ day: state.day, p, creativeId: c.id, rules, stage });
  if (P.strikes.length > 200) P.strikes.splice(0, P.strikes.length - 200);
  const acct = A.accounts?.[p];
  if (!acct || acct.policyBan) return;
  const recent = P.strikes.filter((s) => s.p === p && state.day - s.day <= AD_POLICY.strikeWindowDays).length;
  const misrep = p === 'google' && stage === 'sweep' && rules.some((r) => r !== 'personal_attributes'); // Google Misrepresentation: suspension on detection
  const pBan = misrep ? 0.5 : recent >= 2 ? 1 - Math.pow(1 - AD_POLICY.banPerRepeatStrike, recent - 1) : 0;
  if (!pBan || sideRoll(state, `adban|${p}|${c.id}|${stage}`) >= pBan) return;
  acct.policyBan = { day: state.day, strikes: recent, appeal: null, permanent: false };
  notify(state, `${p} disabled your ad account for repeated policy violations (${recent} strike${recent > 1 ? 's' : ''} in 90 days). Ads stopped delivering. Appeal in Ads Manager → Accounts.`, { type: 'bad', app: 'ads' });
  logMistake(state, { functionId: 'paid_ads', id: 'ad_account_disabled', label: `${p} ad account disabled for policy violations`, app: 'ads', delayed: true, cost: { hours: AD_POLICY.hours.appeal, days: 14, reputation: 1 }, detail: `${recent} policy strike(s) inside 90 days. While disabled nothing delivers and the learning you paid for stalls; a permanent ban means a new account without pixel history. Substantiated claims and a landing page that matches the ad keep strikes at zero.` });
}

/** Daily sweeps and user reports on approved, delivering creatives with violations. */
export function adPolicyDay(state, A, deliveringCreativeIds) {
  const h = -Math.log(1 - AD_POLICY.laterFlagShare) / AD_POLICY.sweepWindowDays;
  for (const c of A.creatives ?? []) {
    if (c.status !== 'approved' || !c.policy?.violations?.length || c.policy.flagged) continue;
    const on = deliveringCreativeIds.get(c.id);
    if (!on || sideRoll(state, `adsweep|${c.id}`) >= h) continue;
    c.policy.flagged = state.day;
    c.status = 'rejected';
    const labels = AD_POLICY.rules.filter((r) => c.policy.violations.includes(r.id)).map((r) => r.label);
    c.rejectReason = `Disapproved after review: ${labels.join('; ')}.`;
    notify(state, `Ad review: "${c.name}" was disapproved after it started delivering (${labels.join('; ')}).`, { type: 'bad', app: 'ads' });
    logMistake(state, { functionId: 'paid_ads', id: 'ad_disapproved_sweep', label: 'Running ad disapproved in a policy sweep', app: 'ads', delayed: true, cost: { hours: AD_POLICY.hours.rewrite, days: 2 }, detail: `"${c.name}" passed automated review but was flagged by a later sweep or user reports: ${labels.join('; ')}. Its ad sets lost their best creative mid-flight.` });
    for (const p of on) strike(state, A, p, c, c.policy.violations, 'sweep');
  }
  // Appeals resolving.
  for (const [p, acct] of Object.entries(A.accounts ?? {})) {
    const b = acct.policyBan;
    if (!b?.appeal || b.appeal.status !== 'pending' || state.day < b.appeal.decideDay) continue;
    const ok = sideRoll(state, `adappeal|${p}`) < (b.strikes <= 2 ? AD_POLICY.appealSuccess.first : AD_POLICY.appealSuccess.repeat);
    b.appeal.status = ok ? 'won' : 'lost';
    if (ok) { acct.policyBan = null; notify(state, `${p}: appeal accepted, the ad account is restored.`, { type: 'good', app: 'ads' }); }
    else { b.permanent = true; notify(state, `${p}: appeal rejected. The ad account stays disabled; you can open a new one, without its pixel history and learning.`, { type: 'bad', app: 'ads' }); }
  }
}

export function appealBan(state, A, p) {
  const b = A.accounts?.[p]?.policyBan;
  if (!b) throw new Error('This account is not disabled.');
  if (b.appeal) throw new Error(b.permanent ? 'The appeal was rejected.' : 'Appeal already in review.');
  const [lo, hi] = AD_POLICY.appealDays;
  b.appeal = { day: state.day, decideDay: state.day + Math.round(lo + sideRoll(state, `adappeal-days|${p}`) * (hi - lo)), status: 'pending' };
  return b.appeal;
}

/** After a permanent ban: a new account (identity verification + fresh learning; pixel and conversion history gone). */
export function rebuildAccount(state, A, p, createAccount) {
  const old = A.accounts?.[p];
  if (!old?.policyBan?.permanent) throw new Error('Only a permanently disabled account needs rebuilding.');
  const [lo, hi] = AD_POLICY.rebuildDays;
  const history = { day: state.day, lifetime: old.lifetime, bans: (old.bans ?? 0) + 1 };
  createAccount(state, p);
  const acct = A.accounts[p];
  acct.bans = history.bans;
  acct.unbilled = old.unbilled ?? 0; // the disabled account's outstanding balance is still owed and billed to the new one
  acct.policyBan = { day: state.day, strikes: 0, appeal: { status: 'rebuilding', decideDay: state.day + Math.round(lo + sideRoll(state, `adrebuild|${p}`) * (hi - lo)) }, permanent: false, rebuilding: true };
  ensurePolicy(A).history.push(history);
  for (const s of A.adsets ?? []) if (s.p === p) s.learn = { start: state.day, status: 'learning' };
  logMistake(state, { functionId: 'paid_ads', id: 'ad_account_rebuilt', label: `Rebuilt the ${p} ad account after a ban`, app: 'ads', delayed: true, circles: true, cost: { hours: AD_POLICY.hours.rebuild, days: acct.policyBan.appeal.decideDay - state.day }, detail: 'New account: identity verification, new pixel, new learning phase. Everything the old account learned about who converts is gone.' });
  return acct;
}

/** Daily: a rebuilding account becomes usable after verification. */
export function rebuildDay(state, A) {
  for (const acct of Object.values(A.accounts ?? {})) {
    const b = acct.policyBan;
    if (b?.rebuilding && state.day >= b.appeal.decideDay) acct.policyBan = null;
  }
}

