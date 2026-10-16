// Customer feature requests grounded in each paying customer's hidden person (core/truth.js via sales/truth-persona.js).
// A customer asks for the jobs that matter to THEIR segment, or (the loud, big accounts above all) for something only
// their own setup needs. The log shows MRR and how many accounts asked, but never says which asks are idiosyncratic:
// building a one-account ask is the classic overfit-to-the-loud-customer trap (docs/research/early-stage/misleading-feedback.md,
// "the one loud big customer"). It logs overfit_to_loud_customer: build hours wasted now, bloat and a custom-flagged
// feature later. Hours and shares are [design].
import { hash, uid } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { activeSubs, monthlyAmount, ensureStripe } from '../../core/stripe.js';
import { featureValue, truthOf } from '../../core/truth.js';
import { personForCustomer, hasTruth } from '../sales/truth-persona.js';
import { productSlice } from '../product/store.js';

export const REQUESTS = { loudMinSubs: 3, loudMrrMult: 1.5, loudIdioP: 0.8, normalIdioP: 0.3, bloatDays: 30 };
const u01 = (s) => (parseInt(hash(s), 36) % 100000) / 100000;
export const requestKey = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 6).join(' ');

const ensureRequests = (slice) => (slice.requests ??= []);

/** The loudest account: the biggest MRR, when it clearly outweighs a typical account. */
export function loudestSub(state) {
  const subs = activeSubs(state);
  if (subs.length < REQUESTS.loudMinSubs) return null;
  const ranked = subs.map((s) => ({ s, mrr: monthlyAmount(s) })).sort((a, b) => b.mrr - a.mrr);
  const median = ranked[Math.floor(ranked.length / 2)].mrr || 1;
  return ranked[0].mrr >= REQUESTS.loudMrrMult * median ? ranked[0].s : null;
}

/**
 * What this paying customer asks for next, from their person facts.
 * { text, idiosyncratic, segmentId, jobId }: idiosyncratic asks come from person.idiosyncraticAsk and have ~no value
 * for the rest of the segment; otherwise an in-segment job they rank high.
 */
export function requestFor(state, sub, customer, { loud = false, salt = '' } = {}) {
  if (!hasTruth(state)) return null;
  const person = personForCustomer(state, customer ?? { id: sub.customerId }, { loud });
  const p = loud ? REQUESTS.loudIdioP : REQUESTS.normalIdioP;
  if (person.idiosyncraticAsk && u01(`ask:${sub.id}:${salt}`) < p) return { text: person.idiosyncraticAsk, idiosyncratic: true, segmentId: person.segmentId, jobId: null };
  const jobs = person.jobsRanked.filter((j) => !j.decoy);
  const job = jobs[Math.floor(u01(`job:${sub.id}:${salt}`) * Math.min(2, jobs.length))] ?? jobs[0];
  if (!job) return null;
  const oneLiner = String(truthOf(state).generatedFor?.oneLiner ?? state.company.oneLiner ?? '').trim();
  const text = job.id === 'core' ? `${oneLiner || 'the core workflow'}: do the main job with fewer manual steps` : `${job.label.toLowerCase()}`;
  return { text, idiosyncratic: false, segmentId: person.segmentId, jobId: job.id };
}

/** Add one asking account to the aggregated request log (MRR and account count add up per request). */
export function logRequest(state, slice, { text, idiosyncratic, segmentId }, sub) {
  const log = ensureRequests(slice);
  const key = requestKey(text) || String(text);
  let r = log.find((x) => x.key === key);
  if (!r) { r = { id: uid('creq'), key, text, idiosyncratic: Boolean(idiosyncratic), segmentIds: [], accountIds: [], mrr: 0, firstDay: state.day, lastDay: state.day, status: 'open', firstCustomerId: sub.customerId }; log.push(r); }
  if (!r.accountIds.includes(sub.customerId)) { r.accountIds.push(sub.customerId); r.mrr = Math.round((r.mrr + monthlyAmount(sub)) * 100) / 100; }
  if (segmentId && !r.segmentIds.includes(segmentId)) r.segmentIds.push(segmentId);
  r.idiosyncratic = r.idiosyncratic && Boolean(idiosyncratic);
  r.lastDay = state.day;
  if (log.length > 200) log.splice(0, log.length - 200);
  return r;
}

/** Is a request only one account's problem? One asker and (hidden) idiosyncratic or no real segment value. */
export function isOverfit(state, req, feature) {
  if (req.accountIds.length > 1) return false;
  const fv = featureValue(state, { ...feature, requestedBy: req.firstCustomerId, custom: true });
  if (req.idiosyncratic || fv.idiosyncratic) return true;
  const own = req.segmentIds.length ? Math.max(0, ...req.segmentIds.map((id) => fv.segmentValues[id] ?? 0)) : fv.value;
  return own < 0.12;
}

const words = (t) => String(t ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
const matches = (req, f) => {
  const text = ` ${f.title ?? ''} ${f.problem ?? ''} `.toLowerCase();
  const kw = words(req.text);
  return f.requestedFrom === req.id || (kw.length > 0 && kw.filter((w) => text.includes(w)).length >= Math.min(2, kw.length));
};

/**
 * Daily: a product feature that matches a one-account request and is queued/building/shipped is the mistake.
 * Hours wasted are logged when the build starts; bloat (maintenance, a UI nobody else uses) a month after it ships.
 */
export function requestsBuildDay(state, slice) {
  const feats = productSlice(state).features ?? [];
  for (const req of ensureRequests(slice)) {
    for (const f of feats) {
      if (!['queued', 'building', 'shipped'].includes(f.status) || (f.createdDay ?? 0) < req.firstDay - 1 || !matches(req, f)) continue;
      if (!isOverfit(state, req, f)) continue;
      const hours = Math.round(((f.agentHours ?? (f.effortHours ? f.effortHours / 2 : 0)) || 6) * 10) / 10;
      f.requestedBy = req.firstCustomerId; f.custom = true; f.requestedFrom = req.id; // truth now values it ~0 for the rest of the market
      req.builtFeatureId = f.id; req.status = 'built';
      logMistake(state, {
        functionId: 'product_prioritization', id: 'overfit_to_loud_customer', label: 'Built a feature only one account needs', app: 'customers', key: `overfit:${f.id}`, delayed: true,
        cost: { hours, days: 3 },
        detail: `"${f.title}" came from one ${req.accountIds.length === 1 ? 'account' : 'request'} (${req.mrr ? `$${Math.round(req.mrr)}/mo` : 'one customer'}), and nobody else in the market asked for it. About ${hours} build hours went into something the rest of the segment will not use, and it stays in the product as bloat to maintain. Before building, check that at least three accounts in your target segment need it unchanged.`,
      });
      if (f.status === 'shipped' && f.shippedDay != null) req.shippedDay = f.shippedDay;
    }
    // Bloat lands a month after the one-account feature ships (settings, support questions, tests nobody else needs).
    if (req.status === 'built' && req.shippedDay != null && !req.bloatLogged && state.day - req.shippedDay >= REQUESTS.bloatDays) {
      req.bloatLogged = true;
      logMistake(state, { functionId: 'product_prioritization', id: 'custom_feature_bloat', label: 'Custom feature bloat', app: 'customers', key: `bloat:${req.id}`, delayed: true, cost: { hours: 4, days: 2 },
        detail: `The feature built for one account ("${req.text}") is still in the product: extra settings, support questions and regression tests, and no other customer uses it.` });
    }
  }
}

/** The request log for the Feedback view: most MRR first, with how many accounts asked. */
export function requestLog(state, slice) {
  const subs = ensureStripe(state).subscriptions;
  return ensureRequests(slice).map((r) => ({ id: r.id, text: r.text, accounts: r.accountIds.length, mrr: r.mrr, status: r.status, lastDay: r.lastDay, topAccountMrr: Math.max(0, ...r.accountIds.map((id) => subs.filter((s) => s.customerId === id).reduce((a, s) => a + monthlyAmount(s), 0))) }))
    .sort((a, b) => b.mrr - a.mrr);
}
