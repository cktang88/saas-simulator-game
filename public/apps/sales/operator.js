// Operator readers for the sales functions (core/operator.js, ARCHITECTURE principle 7).
// Each read comes from what the player DID and what the hidden state says it produced, never from volume, and is
// 'unknown' until the player has acted. Function ids match public/data/operator-tiers.js.
import { registerOperatorReader, tierFromScore, unknownRead, trapCoaching, tierBehaviours } from '../../core/operator.js';
import { clamp } from '../../core/util.js';
import { listHealth, filterShape } from './prospector.js';
import { inboxMetrics } from './inbox.js';
import { notesStats } from './notetaker.js';
import { hygieneStats } from './pipeline.js';
import { burnSummary } from './market-burn.js';

const stellarLine = (fn) => tierBehaviours(fn, 'stellar')[0];

/** Prospecting: list fit, trigger use, verification, bounces, pruning, burned accounts. */
export function prospectingRead(state) {
  const crm = state.apps.crm;
  const p = crm?.prospector;
  const contacts = (crm?.contacts ?? []).filter((c) => !c.hidden && ['manual', 'csv', 'prospector'].includes(c.source));
  const sent = contacts.filter((c) => c.lastContactDay != null);
  if (sent.length < 20) return unknownRead('Send to at least 20 prospects before your list quality can be read.');
  const cos = new Map((crm.companies ?? []).map((c) => [c.id, c]));
  const fits = sent.map((c) => cos.get(c.companyId)?.prospect?.fit ?? cos.get(c.companyId)?.research?.fit).filter((x) => x != null);
  const avgFit = fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : 0.45;
  const bounced = sent.filter((c) => c.status === 'bounced').length / sent.length;
  const verified = sent.filter((c) => c.verification).length / sent.length;
  const wrongPersona = sent.filter((c) => c.prospect?.wrongPersona || c.prospect?.wrongPerson).length / sent.length;
  const searches = p?.searches ?? [];
  const triggerSearch = searches.length ? searches.filter((x) => x.trigger).length / searches.length : 0;
  const reasons = sent.filter((c) => cos.get(c.companyId)?.prospect?.reason).length / sent.length;
  const burn = burnSummary(state);
  const score = clamp(
    0.35 * clamp((avgFit - 0.35) / 0.5, 0, 1) + 0.2 * verified + 0.15 * clamp(1 - bounced / 0.05, 0, 1) + 0.1 * (1 - clamp(wrongPersona / 0.4, 0, 1))
    + 0.1 * triggerSearch + 0.1 * reasons - 0.05 * Math.min(4, burn.burned) - 0.1 * Math.min(2, burn.domainBurns), 0, 1);
  const evidence = [`${sent.length} prospects contacted; average true fit ${Math.round(avgFit * 100)}%`, `bounce ${(bounced * 100).toFixed(1)}%, verified ${Math.round(verified * 100)}%`, `wrong persona ${Math.round(wrongPersona * 100)}%`];
  if (burn.burned) evidence.push(`${burn.burned} account(s) burned by over-contacting`);
  const coaching = [];
  if (bounced > 0.05 || verified < 0.5) coaching.push(trapCoaching('prospecting', 'bought_list'));
  if (avgFit < 0.55 || triggerSearch < 0.3) coaching.push(trapCoaching('prospecting', 'never_prune'));
  if (burn.burned || burn.hotSegments.length) coaching.push(trapCoaching('prospecting', 'volume_as_pipeline'));
  coaching.push(`Stellar: ${stellarLine('prospecting')}`);
  return { tier: tierFromScore(score), score: +score.toFixed(2), n: sent.length, evidence, coaching };
}

/** Discovery and demo: judged call quality, questions, talk share, next steps, recaps, AI-notes hygiene. */
export function discoveryRead(state) {
  const held = (state.apps.calls?.meetings ?? []).filter((m) => m.status === 'held' && m.scorecard && m.day > state.day - 90);
  if (held.length < 2) return unknownRead('Hold at least two calls to read your discovery quality.');
  const avg = (f) => held.reduce((a, m) => a + f(m), 0) / held.length;
  const q = avg((m) => m.quality ?? 0.4);
  const talk = avg((m) => m.scorecard.talkRatio ?? 0.5);
  const next = avg((m) => (m.scorecard.nextStepSecured ? 1 : 0));
  const mock = held.filter((m) => m.cardMock).length / held.length;
  const ns = notesStats(state);
  const deals = state.apps.crm?.deals ?? [];
  const recapShare = deals.filter((d) => d.recap).length ? deals.filter((d) => d.recap?.latency <= 1 && !d.recap.wrong).length / deals.filter((d) => d.recap).length : 0;
  let score = 0.6 * q + 0.15 * next + 0.1 * clamp((0.6 - talk) / 0.25, 0, 1) + 0.1 * recapShare + (ns.pushed ? 0.05 * (ns.reviewed / ns.pushed) : 0.05) - 0.05 * Math.min(3, ns.wrongPushed);
  if (mock > 0.5) score = 0.5 + (score - 0.5) * 0.8; // offline heuristic judge: shrink toward the median
  score = clamp(score, 0, 1);
  const coaching = [];
  if (talk > 0.45) coaching.push(trapCoaching('discovery_demo', 'demo_first'));
  if (next < 0.5) coaching.push(trapCoaching('discovery_demo', 'soft_next_step'));
  if (ns.wrongPushed) coaching.push('Your notetaker pushed things nobody said into the CRM. Check each proposed field against its transcript line before pushing.');
  coaching.push(`Stellar: ${tierBehaviours('discovery_demo', 'stellar').slice(1, 3).join('; ')}`);
  return { tier: tierFromScore(score), score: +score.toFixed(2), n: held.length, evidence: [`${held.length} calls in 90 days, average call quality ${Math.round(q * 100)}%`, `talk share ${Math.round(talk * 100)}%`, `dated next step on ${Math.round(next * 100)}% of calls`, `recap within 24h on ${Math.round(recapShare * 100)}% of deals with a recap`], coaching };
}

/** Deal management: dated next steps, buyer-contact freshness, forecast discipline and accuracy, early discounts. */
export function dealRead(state) {
  const h = hygieneStats(state);
  const deals = state.apps.crm?.deals ?? [];
  const reachedLate = deals.filter((d) => d.history?.some((x) => ['qualified', 'proposal'].includes(x.stage)));
  if (reachedLate.length < 2) return unknownRead('Get two deals to qualified before deal management can be read.');
  const early = reachedLate.filter((d) => d.earlyDiscount).length / reachedLate.length;
  const fcScore = h.meanError == null ? 0.4 : clamp(1 - h.meanError / 0.6, 0, 1);
  const score = clamp(0.25 * (h.datedShare ?? 0.5) + 0.25 * (h.freshShare ?? 0.5) + 0.2 * clamp(h.forecastsLast5w / 4, 0, 1) + 0.2 * fcScore + 0.1 * (1 - early) - 0.03 * Math.min(5, h.zombies), 0, 1);
  const coaching = [];
  if (h.zombies) coaching.push(trapCoaching('deal_management', 'zombie_pipeline'));
  if (h.meanError != null && h.meanError > 0.4) coaching.push(trapCoaching('deal_management', 'commit_inflation'));
  if (early) coaching.push('You discounted before the buyer named a budget. Ask what they budgeted first; trade discounts for term or a case study.');
  coaching.push(`Stellar: ${tierBehaviours('deal_management', 'stellar').slice(0, 2).join('; ')}`);
  return { tier: tierFromScore(score), score: +score.toFixed(2), n: reachedLate.length, evidence: [`${h.open} late-stage deals open, ${Math.round((h.datedShare ?? 0) * 100)}% with a dated next step`, `${h.zombies} with no buyer contact for 30+ days`, `${h.forecastsLast5w} forecast reviews in 5 weeks${h.meanError != null ? `, mean miss ${Math.round(h.meanError * 100)}%` : ''}`, `${Math.round(early * 100)}% of proposals discounted before a budget was stated`], coaching };
}

/** Cold outreach (inbox handling part): meetings per 100 positive replies, opt-outs, mishandled positives. */
export function inboxRead(state) {
  const m = inboxMetrics(state, state.day - 90);
  if (m.positives < 5) return null;
  return m;
}

let done = false;
export function registerSalesReaders() {
  if (done) return;
  done = true;
  registerOperatorReader('prospecting', prospectingRead);
  registerOperatorReader('discovery_demo', discoveryRead);
  registerOperatorReader('deal_management', dealRead);
}
registerSalesReaders();

export { listHealth, filterShape };
