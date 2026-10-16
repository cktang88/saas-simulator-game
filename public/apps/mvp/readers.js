// Operator reader for mvp_experiments (data/operator-tiers.js). It reads what the player DID: whether a threshold was
// written before each test, whether the cheapest test came first, whether the audience was the segment with the
// sharpest pain (reconciled with the hidden market, not with what the player claims), whether signups were read as
// signups and payments as payments, and whether concierge was time-boxed and the fake door was apologised for.
// Not the number of experiments run.

import { registerOperatorReader, unknownRead, tierFromScore, shrink, tierBehaviours } from '../../core/operator.js';
import { round2 } from '../../core/util.js';
import { mvpSlice, FN } from './model.js';
import { MVP } from './params.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const FIRST = { smoke: 1, design_partners: 0.55, concierge: 0.7, wizard: 0.3 };

export function readMvp(state) {
  const sl = state.apps?.mvp;
  const exps = (sl?.experiments ?? []).filter((e) => e.status !== 'abandoned');
  if (!exps.length) return unknownRead('Run a smoke test with a threshold written first: the cheapest test, before you build.');
  const ms = (state.mistakes ?? []).filter((m) => m.functionId === FN);
  const has = (id) => ms.filter((m) => m.id === id).length;
  const parts = [], evidence = [], coaching = [];
  const add = (w, v) => parts.push([w, clamp01(v)]);

  const withCrit = exps.filter((e) => e.hypothesis).length;
  add(0.22, withCrit / exps.length);
  evidence.push(`${withCrit} of ${exps.length} experiments had a hypothesis and a pass/fail threshold before running`);
  if (withCrit < exps.length) coaching.push('Write the metric and the threshold that would change your mind before the page goes live, not after you see the numbers.');

  const first = exps.slice().sort((a, b) => a.order - b.order)[0];
  let f = FIRST[first.type] ?? 0.5;
  if (has('overbuilt_before_validation')) f = 0;
  add(0.18, f);
  evidence.push(`First experiment: ${first.type}${has('overbuilt_before_validation') ? '; built before testing anything' : ''}`);
  if (f < 0.9) coaching.push('Start with the cheapest test: a landing page with a price in front of the right audience takes a day; a manual service or a UI takes weeks.');

  const aud = exps.reduce((a, e) => a + (e.aud?.ok ? 1 : (e.aud?.score ?? 0) > 0 ? 0.35 : 0), 0) / exps.length;
  add(0.2, aud);
  evidence.push(`${exps.filter((e) => e.aud?.ok).length} of ${exps.length} experiments reached the segment with the sharpest pain`);
  if (aud < 0.7) coaching.push('Name the narrow segment you think hurts most and take the test to where they gather; a broad audience dilutes every rate.');

  const smokes = exps.filter((e) => e.type === 'smoke');
  const payShare = smokes.length ? smokes.filter((e) => e.inputs.cta === 'deposit').length / smokes.length : 0.6;
  const calls = exps.filter((e) => e.calledAs && e.calledAs !== 'iterate');
  const badCalls = has('called_on_tiny_n') + has('email_signup_as_demand') + has('ignored_failed_test');
  const cleanCalls = calls.length ? clamp01(1 - badCalls / calls.length) : 0.5;
  add(0.22, 0.5 * payShare + 0.5 * cleanCalls);
  evidence.push(`${smokes.filter((e) => e.inputs.cta === 'deposit').length} of ${smokes.length} smoke tests asked for money; ${badCalls} call(s) on tiny samples, email lists or failed tests`);
  if (payShare < 0.6) coaching.push('Email signups are not payment intent. Put a price and a deposit or pre-order button on the page and read the paid-intent rate.');
  if (badCalls) coaching.push('Do not call a winner on a few dozen visits or on a failed threshold; widen the sample or change the test.');

  const long = has('stayed_concierge_too_long'), nofix = has('fake_door_no_apology'), over = has('overfit_to_design_partner');
  const apologised = exps.filter((e) => e.apologized).length;
  add(0.18, 1 - Math.min(1, 0.5 * long + 0.45 * nofix + 0.4 * over) + Math.min(0.1, 0.05 * apologised));
  evidence.push(`${long} over-long concierge, ${nofix} unapologised fake door, ${over} overfit to a design partner; ${apologised} apology sent`);
  if (long) coaching.push(`Time-box concierge to about ${MVP.cohort.tooLongWeeks} weeks and decide: charge, automate or stop.`);
  if (nofix) coaching.push('Tell everyone who clicked pay that it was a test within a few days, with a refund or a first-access offer.');
  if (over) coaching.push('Build what two or more partners share; one partner\'s custom ask is a project, not a feature.');

  const wsum = parts.reduce((a, [w]) => a + w, 0) || 1;
  const raw = parts.reduce((a, [w, v]) => a + w * v, 0) / wsum;
  const score = round2(shrink(raw, exps.length, 0.5, 1));
  const tier = tierFromScore(score);
  if (tier !== 'stellar') coaching.push(...tierBehaviours(FN).slice(0, 1));
  return { tier, score, raw: round2(raw), n: exps.length, evidence, coaching };
}

registerOperatorReader(FN, readMvp);
