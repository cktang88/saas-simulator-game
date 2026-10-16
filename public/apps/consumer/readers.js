// Operator reader for the consumer-app playbook (function id consumer_app_growth, data/operator-tiers.js). It reads what the player
// DID, not how much: hook-testing discipline, organic -> paid promotion, fraud checks, creator disclosure, paywall honesty,
// plan-mix choices, payback discipline and launch hygiene. Unknown until at least two of those have evidence.

import { registerOperatorReader, tierFromScore, trapCoaching, shrink } from '../../core/operator.js';
import { peekConsumer } from './state.js';
import { creatorStats, briefScore } from './creators.js';
import { clippingStats } from './clipping.js';
import { judgeDisclosure, darkOf } from './monetize.js';
import { MISTAKE_FN, CLIPPING } from './params.js';
import { round2 } from '../../core/util.js';

const FN = MISTAKE_FN;
const mistakes = (state, id) => (state.mistakes ?? []).filter((m) => m.functionId === FN && m.id === id);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function readConsumer(state) {
  const C = peekConsumer(state);
  if (!C) return { tier: 'unknown', evidence: [], coaching: [] };
  const dims = [];
  const ev = [], co = [];
  const add = (key, score, line, trap) => { dims.push({ key, score: clamp01(score) }); ev.push(line); if (score < 0.55 && trap) co.push(trapCoaching(FN, trap)); };

  // launch hygiene: beta, privacy, review history
  if (C.app.stack) {
    const rej = C.app.stats.rejections;
    const s = 0.35 * (C.app.beta.rounds > 0 ? 1 : 0) + 0.3 * (C.app.listing.privacyUrl && C.app.listing.privacyLabel ? 1 : 0) + 0.35 * (C.app.stats.submissions ? clamp01(1 - rej / Math.max(1, C.app.stats.submissions) * 1.2) : 0.5);
    add('launch', s, `Launch: ${C.app.beta.rounds ? 'beta tested' : 'no beta'}, privacy ${C.app.listing.privacyUrl && C.app.listing.privacyLabel ? 'complete' : 'incomplete'}, ${rej} rejection(s) in ${C.app.stats.submissions} submission(s).`, 'app_review_rejected_paywall');
  }
  // paywall honesty and plan mix (once the player has written paywall copy or sold anything)
  const pw = C.monet.paywall;
  const wrote = Object.values(pw.copy ?? {}).some((v) => String(v).trim());
  const sold = (state.stripe?.subscriptions ?? []).some((s) => s.mobile);
  if (wrote || sold) {
    const d = pw.disclosure ?? judgeDisclosure(pw);
    const dark = darkOf(pw).on.length;
    add('paywall', clamp01(d.score - 0.25 * dark), `Paywall disclosure ${Math.round(d.score * 100)}%${dark ? `, ${dark} dark pattern(s)` : ', no dark patterns'}.`, 'app_review_rejected_paywall');
    const plans = Object.entries(pw.plans).filter(([, p]) => p.on).map(([n]) => n);
    const tested = C.monet.tests.filter((t) => t.status === 'done' && t.verdict !== 'underpowered').length;
    const early = mistakes(state, 'paywall_test_called_early').length;
    const weeklyOnly = plans.length === 1 && plans[0] === 'weekly';
    const s = 0.35 + (plans.includes('annual') ? 0.2 : 0) + (weeklyOnly ? -0.2 : 0) + (tested ? 0.25 : 0) - 0.15 * early - 0.3 * Math.min(1, mistakes(state, 'weekly_plan_refund_spike').length + mistakes(state, 'aggressive_paywall_refunds').length) + (pw.quiz?.score >= 0.6 ? 0.15 : 0);
    add('planMix', s, `Plan mix: ${plans.join(' + ')}${tested ? `, ${tested} paywall test(s) read properly` : ', no paywall test'}${pw.quiz ? `, quiz ${Math.round(pw.quiz.score * 100)}%` : ''}.`, 'weekly_plan_refund_spike');
  }
  // creators: hook testing, brief quality, disclosure
  const cs = creatorStats(state);
  if (cs.posts > 0) {
    const briefs = C.creators.briefs;
    const bq = briefs.length ? briefs.reduce((a, b) => a + (b.score ?? briefScore(state, b)), 0) / briefs.length : 0.4;
    const hooks = cs.hooksTested;
    const h = (hooks >= 5 ? 1 : hooks >= 3 ? 0.75 : hooks === 2 ? 0.45 : 0.2);
    add('hookTesting', shrink(0.6 * h + 0.4 * bq, cs.posts, 0.5, 4), `Hooks: ${hooks} distinct hook(s) tested over ${cs.posts} creator posts, average brief ${Math.round(bq * 100)}%; ${cs.breakouts} break-out(s).`, 'views_without_installs');
    const dis = cs.disclosedShare;
    const s = (dis >= 0.9 ? 1 : dis >= 0.7 ? 0.6 : 0.2) - 0.25 * Math.min(2, cs.strikes) + (C.creators.audits ? 0.1 : 0);
    add('disclosure', s, `Disclosure: ${Math.round(dis * 100)}% of paid posts labelled, ${cs.strikes} strike(s), ${C.creators.audits} audit(s).`, 'undisclosed_creator_posts');
  }
  // organic -> paid
  const paid = C.paid.campaigns;
  if (paid.length) {
    const org = cs.posts > 0 || C.clipping.campaigns.length > 0;
    const s = cs.provenPromoted ? 1 : cs.promoted ? 0.5 : org ? 0.4 : 0.25;
    add('organicToPaid', s, cs.promoted ? `Promoted ${cs.promoted} organic hook(s) to Meta (${cs.provenPromoted} proven by break-out views).` : 'Paid creative was made without testing hooks organically first.', 'scaled_ads_before_payback');
    const scaled = mistakes(state, 'scaled_ads_before_payback').length + mistakes(state, 'store_fee_not_in_model').length;
    add('payback', 0.3 + (C.paid.target.basis === 'net' ? 0.25 : 0) + (scaled ? 0 : 0.45) - 0.05 * scaled, `Payback: target on ${C.paid.target.basis} D7 ROAS, ${scaled} scale-before-payback / fee-model mistake(s).`, 'scaled_ads_before_payback');
  }
  // clipping: fraud checks and fit
  const cl = clippingStats(state);
  if (cl.campaigns > 0) {
    const w = C.clipping.campaigns.reduce((a, c) => a + (c.verification === 'manual' ? 1 : c.verification === 'basic' ? 0.5 : 0.05), 0) / cl.campaigns;
    const bad = mistakes(state, 'paid_for_botted_views').length + mistakes(state, 'clip_accounts_banned_policy').length + mistakes(state, 'views_without_installs').length;
    add('fraudChecks', shrink(w - 0.15 * bad, cl.campaigns, 0.5, 1), `Clipping: ${C.clipping.campaigns.map((c) => CLIPPING.verification[c.verification].label.toLowerCase()).slice(0, 2).join('; ')}; ${cl.detected} botted clip(s) caught, ${bad} fraud/policy/fit mistake(s).`, 'paid_for_botted_views');
  }
  if (dims.length < 2) return { tier: 'unknown', evidence: ev, coaching: [] };
  const score = round2(dims.reduce((a, d) => a + d.score, 0) / dims.length);
  return { tier: tierFromScore(score), score, dims: Object.fromEntries(dims.map((d) => [d.key, round2(d.score)])), evidence: ev, coaching: [...new Set(co)].slice(0, 5) };
}

registerOperatorReader(FN, readConsumer);
