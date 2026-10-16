// Website social proof vs reality (docs/research/verification/market-people.md §1.3, §1.8, §2.1-2.3). The landing
// panel judges the WRITING (LLM trust_match, offline heuristic); what the page claims ("2,000+ teams", "4.9★ from 300
// reviews", "trusted by 500 companies") is recorded here with the truth at that moment (core/integrity.js, audience
// 'customer', recipient 'website'). It is checked later, never on publish: buyers' reference calls and backchannel
// (sales/references.js, ~35% for an outright customer-count lie), competitor complaints and NAD challenges (~2%/yr
// for unsubstantiated claims, more with active competitors), and the FTC fake-review / fake-social-indicator rule
// (16 CFR 465: ~3%/yr for a few fake ratings, ~25%/yr when fabricated systematically). All rates are [design].

import { extractClaims, socialProofClaims, recordClaims, openLies, penalize, ensureIntegrity } from '../../core/integrity.js';
import { activeSubs, mrr } from '../../core/stripe.js';
import { ensureMarket } from '../../core/market.js';
import { post } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { rng, chance, hash } from '../../core/util.js';
import { knownCompetitors } from '../marketworld/competitors.js';

export const PROOF = {
  ftcPerYear: { few: 0.03, systematic: 0.25 },
  complaintPerYear: 0.02, competitorMult: 2,
  warningUsd: [3000, 8000], actionUsd: [50000, 150000], actionShare: 0.2, // most first cases end in a warning letter [design]
  trustCut: 0.85, // the stored landing-page score after a public correction [design]
};

/** Ground truth for social proof: paying customers, genuine (non-fake, not removed) reviews and their average. */
export function proofTruth(state) {
  const sup = state.apps.support ?? {};
  const real = (sup.reviews ?? []).filter((r) => !r.fake && !r.removed);
  const extra = state.apps.channels?.reviews?.count ?? 0;
  const n = real.length + extra;
  return { customers: state.stripe ? activeSubs(state).length : 0, mrr: state.stripe ? mrr(state) : 0, reviews: n, rating: real.length ? real.reduce((a, r) => a + r.rating, 0) / real.length : n ? 4.2 : 0 };
}

/** Record the page's social-proof claims once per version of the page. Returns the material lies. */
export function recordSiteClaims(state, text) {
  const site = state.company.website;
  if (!site || !text) return [];
  const h = hash(text);
  if (site.claimsHash === h) return [];
  site.claimsHash = h;
  // A new version of the page replaces the old claims (a removed lie is no longer being told; one already caught stays caught).
  for (const c of ensureIntegrity(state).claims) if (c.recipientId === 'website' && c.status === 'open') c.status = 'withdrawn';
  const truth = proofTruth(state);
  const sp = socialProofClaims(text, truth);
  const claims = [...extractClaims(text).filter((c) => c.metric === 'customers' && !sp.some((x) => x.metric === 'customers')), ...sp];
  if (!claims.length) return [];
  return recordClaims(state, { audience: 'customer', recipientId: 'website', channel: 'website', claims, truth });
}

/** Daily: competitor complaints, NAD challenges and FTC sweeps against claims that are still on the page. */
export function siteClaimsDay(state) {
  const lies = state.integrity ? openLies(state, { recipientId: 'website' }) : [];
  if (!lies.length) return;
  let rivals = 0;
  try { rivals = (knownCompetitors(state, { audience: 'prospect', seed: 'site-claims' }) ?? []).length; } catch { rivals = 0; }
  for (const c of lies) {
    const reviewish = c.metric === 'rating' || c.metric === 'reviews';
    const yr = reviewish ? (c.gap >= 1 || !c.truth ? PROOF.ftcPerYear.systematic : PROOF.ftcPerYear.few) : PROOF.complaintPerYear * (c.gap >= 1 ? 2 : 1) * (rivals ? PROOF.competitorMult : 1);
    if (!chance(state, yr / 365)) continue;
    Object.assign(c, { status: 'caught', caughtDay: state.day, caughtBy: reviewish ? 'FTC fake-review rule' : 'competitor complaint' });
    const action = reviewish && chance(state, PROOF.actionShare);
    const [lo, hi] = action ? PROOF.actionUsd : PROOF.warningUsd;
    const usd = Math.round(lo + (hi - lo) * rng(state));
    post(state, { amount: -usd, counterparty: 'Outside counsel', description: action ? 'FTC investigation: fake reviews / social indicators' : reviewish ? 'FTC warning letter response' : 'Advertising claim challenge (competitor / NAD)', category: 'legal', method: 'ach' });
    const fit = ensureMarket(state).fit.website;
    if (fit?.score != null) fit.score = +(fit.score * PROOF.trustCut).toFixed(3);
    penalize(state, [c], {
      audience: 'customer', functionId: 'positioning_landing', id: reviewish ? 'fake_social_proof' : 'unsubstantiated_customer_claim', label: reviewish ? 'Website ratings or reviews you could not substantiate' : 'Website customer claim you could not substantiate', usd, app: 'website',
      detail: `Your site said "${c.text}" (real: ${c.metric === 'customers' ? `${c.truth} paying customers` : c.metric === 'reviews' ? `${c.truth} reviews` : c.truth ? `${Math.round(c.truth * 10) / 10}★` : 'no reviews'}). ${action ? 'The FTC opened an investigation under the fake-review and social-indicator rule (16 CFR 465).' : reviewish ? 'An FTC warning letter cited the fake-review rule (16 CFR 465).' : 'A competitor challenged it; you had to substantiate or take it down.'}`,
    });
    notify(state, `${reviewish ? 'Fake social proof flagged' : 'Customer claim challenged'}: "${c.text}" on your website. Legal cost $${usd.toLocaleString('en-US')}.`, { type: 'bad', app: 'website' });
  }
}
