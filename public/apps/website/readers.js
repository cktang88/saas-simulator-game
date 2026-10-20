// Operator reader for positioning_landing (data/operator-tiers.js). It reads what the player DID with the website:
// the stored landing-panel score of the page that is live (kept for an unchanged page, so re-running does not fish
// for a lucky roll), how specific and plain the copy is per the panel's rubric, whether the page was measured before
// it was changed (panel on the live version, site iterations made on data rather than blind), and the traceable
// mistakes the website app logged (generic AI copy, blind redesigns, fake social proof, trademark domains). Never the
// number of edits or panel runs, and never keywords on the page (the panel's own buzzword and proof checks apply).

import { registerOperatorReader, unknownRead, tierFromScore, shrink, tierBehaviours, trapCoaching } from '../../core/operator.js';
import { round2 } from '../../core/util.js';
import { siteBuildSlice, siteCoaching } from './sitebuild.js';

export const FN = 'positioning_landing';
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// How much each logged website mistake drags the read down (0..1 of the "clean" component) [design].
const MISTAKE_WEIGHT = { fake_social_proof: 0.6, unsubstantiated_customer_claim: 0.4, trademark_domain: 0.4, lost_domain_trademark: 0.3, generic_ai_site: 0.35, redesign_without_data: 0.3, overpaid_domain_prerevenue: 0.25, domain_churn: 0.2, weak_domain: 0.15 };

export function readLanding(state) {
  const site = state.company?.website;
  const fit = state.market?.fit?.website;
  const build = siteBuildSlice(state);
  const judged = fit?.score != null;
  if (!judged && !build) return unknownRead('Put your landing page up and run the customer panel on it before you send traffic: a baseline first.');
  const parts = [], evidence = [], coaching = [];
  const add = (w, v) => parts.push([w, clamp01(v)]);

  // 1. The page itself, as the panel judged it (clarity, relevance, proof, price, CTA, stated trial intent).
  if (judged) {
    add(0.4, fit.score);
    evidence.push(`Landing panel score ${Math.round(fit.score * 100)}/100 (${fit.source ?? 'panel'})`);
    if (fit.score < 0.6) coaching.push(trapCoaching(FN, 'feature_hero', 'Say who it is for and what they stop doing, in the first line.'));
  } else coaching.push('Run the landing-page panel: you are judging the page by feel.');

  // 2. Specific, plain copy (the panel rubric's specific_plain_copy and 5-second value proposition), else the build brief.
  const rows = (site?.eval?.results ?? []).flatMap((r) => r.results ?? []);
  const crit = (f) => { const v = rows.map((d) => Number(d[f])).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const spc = crit('specific_plain_copy'), vp = crit('value_prop_5s');
  let spec = null;
  if (spc != null || vp != null) { spec = ((spc ?? vp) + (vp ?? spc)) / 2; spec = (spec - 1) / 4; evidence.push(`Panel rated the copy ${round2(spc ?? vp)}/5 for specific, plain language and ${round2(vp ?? spc)}/5 for the 5-second value proposition`); }
  else if (build) { spec = (build.briefScore ?? 0) * (1 - (build.generic ?? 0)); evidence.push(`Site brief ${Math.round((build.briefScore ?? 0) * 100)}/100, ${Math.round((build.generic ?? 0) * 100)}% stock AI copy`); }
  if (spec != null) { add(0.2, spec); if (spec < 0.6) coaching.push('Name a specific buyer, their pain and a measurable outcome; cut the adjectives.'); }

  // 3. Measure before you change: the live version was judged, and site iterations followed data, not feel.
  const measuredLive = Boolean(site?.eval);
  const iters = build?.iterations ?? [];
  const useful = iters.filter((i) => i.useful).length;
  const iterTerm = iters.length ? useful / iters.length : 0.5;
  add(0.2, (measuredLive ? 0.5 : 0) + 0.5 * iterTerm);
  evidence.push(`${measuredLive ? 'The live page version was measured' : 'The live page version was never measured'}${iters.length ? `; ${useful} of ${iters.length} site iteration(s) followed a panel run or real traffic` : ''}`);
  if (!measuredLive) coaching.push('Run the panel on the version that is live before you send traffic or change it again.');
  if (iters.length && useful < iters.length) coaching.push(trapCoaching(FN, 'full_redesign', 'Change one thing, run it two weeks, keep what moved the number.'));

  // 4. Mistakes the website app logged against this function.
  const ms = (state.mistakes ?? []).filter((m) => m.functionId === FN);
  const drag = ms.reduce((a, m) => a + (MISTAKE_WEIGHT[m.id] ?? 0.25), 0);
  add(0.2, 1 - Math.min(1, drag));
  evidence.push(ms.length ? `${ms.length} website mistake(s) logged: ${[...new Set(ms.map((m) => m.label))].slice(0, 3).join('; ')}` : 'No website mistakes logged');
  if (build) coaching.push(...siteCoaching(build).slice(0, 2));

  const wsum = parts.reduce((a, [w]) => a + w, 0) || 1;
  const raw = parts.reduce((a, [w, v]) => a + w * v, 0) / wsum;
  const n = (judged ? 1 : 0) + (build ? 1 : 0) + useful;
  const score = round2(shrink(raw, n, 0.5, 1));
  const tier = tierFromScore(score);
  if (tier !== 'stellar') coaching.push(...tierBehaviours(FN).slice(0, 1));
  return { tier, score, raw: round2(raw), n, evidence, coaching };
}

registerOperatorReader(FN, readLanding);
