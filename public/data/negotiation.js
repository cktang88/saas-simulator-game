// Negotiation data: counterparty styles, hours, researched norms, issue catalogs and the [design] numbers the engine
// (core/negotiation.js) and the adapters (apps/negotiate/*) use. DATA ONLY: no logic.
// Research: docs/research/negotiation/science-and-enterprise.md, docs/research/negotiation/vc-terms.md,
// docs/research/ops-2026/negotiation-onboarding.md. Tags: [sourced] = a URL was retrieved in the research pass (often a
// secondary or vendor source); [unverified] = practitioner norm; [design] = our assumption, never shown to players as a
// real statistic.

// ---- Counterparty styles (all numbers [design]) ----
// c0/decay: share of the remaining gap to the reservation the counterparty concedes in round 1, and its per-round decay
//   (diminishing concessions are a standard finding [unverified: general literature]).
// openAsp: how high it aims at the start (share of the surplus range above its reservation).
// anchorPull: how far the player's first offer drags its target [Galinsky & Mussweiler 2001, sourced].
// walkOnExtreme: chance it ends the talks over an offer far outside its zone of agreement.
// bluffDetect: chance it catches an invented competing offer in a round.
// trades: finds cheap-for-it, valuable-for-you trades (logrolling) by itself.
// splitAccept: chance it takes "split the difference" when the middle clears its reservation.
// roundDays: calendar days a round of back-and-forth takes.
export const STYLES = {
  hardball: { label: 'Hardball procurement', c0: 0.28, decay: 0.8, openAsp: 0.85, anchorPull: 0.26, walkOnExtreme: 0.15, bluffDetect: 0.55, trades: false, splitAccept: 0.35, roundDays: 3, patience: 6, recip: 1.1, blurb: 'Opens with a big ask, concedes in small steps, tests whether your alternatives are real.' },
  collaborative: { label: 'Collaborative partner', c0: 0.3, decay: 0.8, openAsp: 0.78, anchorPull: 0.3, walkOnExtreme: 0.3, bluffDetect: 0.3, trades: true, splitAccept: 0.85, roundDays: 2, patience: 8, recip: 1.0, blurb: 'Shares what matters to them if you ask, trades across issues, takes insults personally.' },
  time_pressed: { label: 'Time-pressed decider', c0: 0.4, decay: 0.6, openAsp: 0.82, anchorPull: 0.35, walkOnExtreme: 0.4, bluffDetect: 0.15, trades: false, splitAccept: 0.7, roundDays: 1, patience: 4, recip: 0.9, blurb: 'Wants it done this week. Concedes fast, walks fast, rarely checks your story.' },
  bureaucratic: { label: 'Bureaucratic process', c0: 0.16, decay: 0.85, openAsp: 0.88, anchorPull: 0.18, walkOnExtreme: 0.1, bluffDetect: 0.4, trades: false, splitAccept: 0.4, roundDays: 6, patience: 9, recip: 1.0, blurb: 'Every change goes to legal or a committee: slow, rigid on policy items, flexible on price within authority.' },
};

// Founder hours per round and per Prepare step, by stakes [design].
export const ROUND_HOURS = { low: 0.25, mid: 0.5, high: 1 };
export const PREP_HOURS = {
  low: { batna: 0.5, norms: 0.5, counterparty: 0.75 },
  mid: { batna: 0.75, norms: 0.75, counterparty: 1.25 },
  high: { batna: 1.5, norms: 1, counterparty: 2 },
};
export const PREP_LABELS = {
  batna: { label: 'Map your alternatives (BATNA)', hint: 'Competing offers, other pipeline deals, other candidates: what you really walk to.' },
  norms: { label: 'Look up market norms', hint: 'The researched ranges for each term, so you can anchor inside the zone, not below it or far beyond it.' },
  counterparty: { label: 'Research the other side', hint: 'Who decides, what they care about, how they negotiate. Deeper research reveals more.' },
};

// Engine tuning [design].
export const ENGINE = {
  extremeGap: 0.25, // cp utility below its reservation at which an offer reads as insulting
  precisePullMult: 1.35, // a precise first number (47,500 not 50,000) pulls harder, capped [Janiszewski & Uy 2008, sourced]
  cpOpenedPullMult: 0.6, // when they opened first, your anchor pulls less
  minMargin: 0.012, // counterparty never concedes all the way to its reservation
  noMoveEps: 0.02, // movement smaller than this reads as holding firm
  bigConcession: 0.12, // one-move concession (in their utility) that reads as soft
  patienceMissLimit: 1, // unproductive rounds before patience starts to drain
  trustWalk: 0.12, // below this trust the counterparty walks
  leverageDrop: 0.2, // share of the remaining gap a real alternative removes from their target
  walkThreatDrop: 0.3, // extra share when a credible walk-away is stated
  bluffLateDiscovery: 0.4, // a bluff that survives the call is found at signing with this chance
  deadlinePressure: 0.5, // at their own deadline their target sits this share closer to the reservation
  playerDeadlineSlow: 0.6, // concession multiplier once they know your deadline is days away
  nearDeadlineDays: 10,
  splitSlack: 0.0,
  messageMax: 700,
  maxRoundsExtra: 3,
};

// ---- Enterprise SaaS deals (sales adapter) ----
// Discount bands by deal size [design], from the working range in science-and-enterprise.md section 2:
// 5-10% under $10K, 10-20% for $25-100K, 15-25% for $100K+ with a multi-year term. Vendr averages ~11% (secondary/vendor),
// Qualified 22.9% at $51K, GrowthSpree median 12% and 22% for $200K+ (vendor marketing): all directional, not market fact.
export const DISCOUNT_BANDS = [
  { max: 10000, lo: 0.03, hi: 0.10, ask: 0.13, label: 'under $10K' },
  { max: 25000, lo: 0.06, hi: 0.15, ask: 0.2, label: '$10-25K' },
  { max: 100000, lo: 0.1, hi: 0.2, ask: 0.26, label: '$25-100K' },
  { max: Infinity, lo: 0.15, hi: 0.25, ask: 0.33, label: '$100K+' },
];
export const discountBand = (acv) => DISCOUNT_BANDS.find((b) => acv < b.max);

// Give-gets, as discount points per concession the buyer makes [design; multi-year ~5%, early renewal ~5%, case study ~5%
// are vendor-guide examples: sourced secondary].
export const GIVE_GETS = { multiYear: 0.05, caseStudy: 0.05, annualPrepay: 0.04, logoOnly: 0.02 };

// Which buyer-segment groups procure how (style) [design].
export const SEGMENT_STYLE = { public: 'bureaucratic', regulated: 'bureaucratic', health: 'bureaucratic', education: 'bureaucratic', company: 'hardball', professional: 'collaborative', owner_smb: 'time_pressed', nonprofit: 'collaborative' };

export const ENTERPRISE_ISSUES = [
  { id: 'discount', label: 'Discount off list', type: 'num', unit: '%', fmt: 'pct', min: 0, max: 0.35, step: 0.01, pDir: -1, cDir: 1, wp: 0.26, wc: 0.26, band: 'Working range by deal size: 3-10% under $10K, 6-15% $10-25K, 10-20% $25-100K, 15-25% $100K+ [design]. Vendr averages ~11% across 40,000+ deals (vendor data, directional).' },
  { id: 'term', label: 'Term length', type: 'opt', wp: 0.14, wc: 0.06, band: 'Multi-year is worth about 5% in discount to the buyer [sourced, vendor guide]. Longer term = less churn risk for you, less flexibility for them.',
    options: [{ id: '1', label: '1 year', pu: 0, cu: 0.85 }, { id: '2', label: '2 years', pu: 0.6, cu: 0.5 }, { id: '3', label: '3 years', pu: 1, cu: 0.15 }] },
  { id: 'payment', label: 'Payment terms', type: 'opt', wp: 0.1, wc: 0.18, band: 'Net 30 is the default. Buyers ask net 60-90; every extra 30 days of net terms is cash you finance [unverified practitioner norm].',
    options: [{ id: 'upfront', label: 'Annual upfront', pu: 1, cu: 0 }, { id: 'net30', label: 'Net 30', pu: 0.8, cu: 0.25 }, { id: 'net60', label: 'Net 60', pu: 0.35, cu: 0.7 }, { id: 'net90', label: 'Net 90', pu: 0, cu: 1 }] },
  { id: 'uplift', label: 'Renewal uplift cap', type: 'opt', wp: 0.1, wc: 0.06, band: 'Common cap language is 3-5% per year or CPI, whichever is lower (advice-level, not a measured norm); observed vendor uplifts 8-12% [sourced, secondary].',
    options: [{ id: 'none', label: 'No cap', pu: 1, cu: 0 }, { id: 'cap7', label: 'Capped at 7% a year', pu: 0.7, cu: 0.3 }, { id: 'cap5', label: 'Capped at 5% a year', pu: 0.4, cu: 0.7 }, { id: 'cap3', label: 'Capped at 3% a year', pu: 0.15, cu: 0.9 }, { id: 'lock', label: 'Price locked for the term', pu: 0, cu: 1 }] },
  { id: 'mfn', label: 'Most-favored-nation pricing', type: 'opt', policy: true, wp: 0.08, wc: 0.06, band: 'No usable source on MFN prevalence [unverified]; a [design] term. If you later discount another customer deeper, an MFN customer is repriced to match.',
    options: [{ id: 'none', label: 'No MFN', pu: 1, cu: 0 }, { id: 'similar', label: 'MFN vs similar customers only', pu: 0.45, cu: 0.55 }, { id: 'full', label: 'Full MFN on price', pu: 0, cu: 1 }] },
  { id: 'liability', label: 'Liability cap', type: 'opt', policy: true, wp: 0.12, wc: 0.08, band: 'Vendor default is 12 months of fees; mid-market 100-200% of annual fees; common landing zone 1x direct + 3x data/confidentiality super-cap, not unlimited [sourced, secondary].',
    options: [{ id: 'cap1x', label: '1x annual fees', pu: 1, cu: 0 }, { id: 'super3x', label: '1x fees + 3x data super-cap', pu: 0.75, cu: 0.45 }, { id: 'cap2x', label: '2x fees + 5x data super-cap', pu: 0.4, cu: 0.75 }, { id: 'uncapped', label: 'Uncapped', pu: 0, cu: 1 }] },
  { id: 'tfc', label: 'Termination for convenience', type: 'opt', policy: true, wp: 0.08, wc: 0.08, band: 'Standard buyer ask; no benchmark retrieved [unverified]. Anytime termination turns a 3-year deal into a month-to-month one.',
    options: [{ id: 'none', label: 'None (term is committed)', pu: 1, cu: 0 }, { id: 'y2', label: 'After year 1, 90 days notice', pu: 0.4, cu: 0.65 }, { id: 'any', label: 'Anytime on 30 days notice', pu: 0, cu: 1 }] },
  { id: 'sla', label: 'SLA credits', type: 'opt', wp: 0.03, wc: 0.1, band: 'Standard buyer ask [unverified]. Credits are a refund of part of the fee when uptime misses the target.',
    options: [{ id: 'none', label: 'Standard (credits up to 5%)', pu: 1, cu: 0 }, { id: 'std', label: '99.9% with credits up to 10%', pu: 0.6, cu: 0.5 }, { id: 'strong', label: '99.95% with credits up to 25% + exit right', pu: 0.15, cu: 1 }] },
  { id: 'logo', label: 'Case study / logo rights', type: 'opt', wp: 0.06, wc: 0.02, band: 'Logo or case study is worth about 5% of price to the vendor [sourced, vendor guide]; it costs the buyer a PR/legal approval.',
    options: [{ id: 'no', label: 'No publicity', pu: 0, cu: 0.6 }, { id: 'logo', label: 'Logo use only', pu: 0.5, cu: 0.3 }, { id: 'case', label: 'Logo + case study', pu: 1, cu: 0 }] },
  { id: 'start', label: 'Start date', type: 'opt', wp: 0.03, wc: 0.1, band: 'Billing starts at signature; a later start is revenue you do not get yet [design].',
    options: [{ id: 'now', label: 'Within 15 days', pu: 1, cu: 0.1 }, { id: 'd30', label: '30 days', pu: 0.6, cu: 0.5 }, { id: 'd60', label: '60 days', pu: 0.25, cu: 0.85 }, { id: 'd90', label: '90 days (next quarter)', pu: 0, cu: 1 }] },
];

// ---- VC term sheets (fundraising adapter) ----
export const VC = {
  // Negotiating room an investor keeps above its first valuation [design]; a second real term sheet adds 5-15% (no
  // founder-side dataset measures this; vc-terms.md section 2 gives the [design] 5-15% lift).
  roomBase: [0.03, 0.09],
  leverageLift: [0.05, 0.15],
  explodingDays: 5,
  poolMarket: [0.1, 0.15], // pool sizes of 10-15% post-money are common [unverified]
  shopRepRisk: 0.5, // reputation hit when a term-sheet claim turns out invented
  shopRepRiskReal: 0.15, // reputation cost of visibly shopping a real term sheet around
  marketLiqPref1xNP: 0.964, // 1x non-participating: 96.4% of US deals in Q1 2026 [sourced, Cooley]
  marketParticipating: 0.05, // ~5% of US financings [sourced via Osler, secondary]
};
export const VC_PRICED_ISSUES = [
  { id: 'preMoney', label: 'Pre-money valuation', type: 'num', unit: '$', fmt: 'usd', pDir: 1, cDir: -1, wp: 0.3, wc: 0.3, band: 'Seed pre-money median about $18M (PitchBook-NVCA Q1 2026, secondary); Series A about $52-62M (Cooley/PitchBook) [unverified]. Investors keep a few percent of room; a second real term sheet lifts 5-15% [design].' },
  { id: 'pool', label: 'Option pool (post-money, set in the pre-money)', type: 'num', unit: '%', fmt: 'pct', min: 0.05, max: 0.2, step: 0.01, pDir: -1, cDir: 1, wp: 0.12, wc: 0.1, band: 'A pool of 10-15% post-money is common [unverified]. It is set pre-money, so it shrinks your effective valuation: a $12M headline with a 10% pool on a $15M post is $10.5M effective (-12.5%).' },
  { id: 'liq', label: 'Liquidation preference', type: 'opt', wp: 0.14, wc: 0.14, band: '1x non-participating is the market: 96.4% of US deals in Q1 2026 [sourced, Cooley]. Participating is about 5% of US financings [sourced, secondary]. 2x participating cuts common proceeds ~20% at a $100M exit (worked example in vc-terms.md).',
    options: [{ id: 'np1', label: '1x non-participating', pu: 1, cu: 0.1 }, { id: 'p1', label: '1x participating', pu: 0.3, cu: 0.8 }, { id: 'np2', label: '2x non-participating', pu: 0.45, cu: 0.65 }, { id: 'p2', label: '2x participating', pu: 0, cu: 1 }] },
  { id: 'board', label: 'Board composition', type: 'opt', policy: true, wp: 0.14, wc: 0.12, band: 'Seed boards are typically 3 seats: 2 founders + 1 investor; Series A 2-2-1 is the most common [unverified, practitioner sources]. An investor-majority board can replace the CEO.',
    options: [{ id: 'founder', label: '3 seats: 2 founders + 1 investor', pu: 1, cu: 0.3 }, { id: 'indep', label: '3 seats: 1 founder + 1 investor + 1 mutual independent', pu: 0.7, cu: 0.5 }, { id: 'balanced', label: '5 seats: 2 founders + 2 investors + 1 independent', pu: 0.4, cu: 0.8 }, { id: 'investor', label: 'Investor-controlled board', pu: 0, cu: 1 }] },
  { id: 'proRata', label: 'Pro rata rights', type: 'opt', wp: 0.05, wc: 0.08, band: 'Most priced rounds give pro rata to some preferred holders (94.7% in Canada 2025, Osler, secondary).',
    options: [{ id: 'none', label: 'None', pu: 1, cu: 0 }, { id: 'major', label: 'Major-investor pro rata', pu: 0.6, cu: 0.7 }, { id: 'super', label: 'Super pro rata (up to 2x)', pu: 0, cu: 1 }] },
  { id: 'vesting', label: 'Founder vesting', type: 'opt', wp: 0.1, wc: 0.08, band: 'Double-trigger acceleration is the norm [unverified, secondary]. A full 4-year re-vest with a 1-year cliff resets founder equity and adds retention pressure at exit [design].',
    options: [{ id: 'keep', label: 'Keep existing vesting + double-trigger acceleration', pu: 1, cu: 0.05 }, { id: 'partial', label: 'Re-vest 25% over 2 years', pu: 0.6, cu: 0.45 }, { id: 'reset', label: 'Full 4-year reset, 1-year cliff, no acceleration', pu: 0, cu: 1 }] },
  { id: 'protective', label: 'Protective provisions', type: 'opt', policy: true, wp: 0.08, wc: 0.07, band: 'NVCA-model provisions (consent for new senior securities, sale, charter changes) are standard [design]. A broad list adds budget and hiring vetoes.',
    options: [{ id: 'standard', label: 'Standard NVCA provisions', pu: 0.8, cu: 0.4 }, { id: 'light', label: 'Light (sale and new senior stock only)', pu: 1, cu: 0.1 }, { id: 'broad', label: 'Broad (adds budget, hiring, debt vetoes)', pu: 0, cu: 1 }] },
  { id: 'round', label: 'Round size', type: 'opt', wp: 0.05, wc: 0.06, band: 'A bigger round buys runway and costs dilution; term sheets are usually sized to 18-24 months of runway [unverified]. Both sides usually prefer a larger round [design].',
    options: [{ id: 'small', label: 'Smaller (-25%)', pu: 0.35, cu: 0.2 }, { id: 'base', label: 'As proposed', pu: 0.6, cu: 0.6 }, { id: 'large', label: 'Larger (+25%)', pu: 1, cu: 1 }] },
  { id: 'noShop', label: 'No-shop period', type: 'opt', wp: 0.07, wc: 0.08, band: 'No-shop 30-60 days, 45-60 common; term sheet to close 4-8 weeks [unverified]. A long no-shop freezes your leverage.',
    options: [{ id: 'd30', label: '30 days', pu: 1, cu: 0.1 }, { id: 'd45', label: '45 days', pu: 0.7, cu: 0.4 }, { id: 'd60', label: '60 days', pu: 0.3, cu: 0.8 }, { id: 'd90', label: '90 days', pu: 0, cu: 1 }] },
];
export const VC_SAFE_ISSUES = [
  { id: 'cap', label: 'Post-money cap', type: 'num', unit: '$', fmt: 'usd', pDir: 1, cDir: -1, wp: 0.45, wc: 0.4, band: 'Carta SAFE post-money cap medians 2025: ~$10M for $250K-$1M rounds, ~$15M for $1M-$2.5M [sourced, Carta].' },
  { id: 'discount', label: 'Discount', type: 'num', unit: '%', fmt: 'pct', min: 0, max: 0.25, step: 0.05, pDir: -1, cDir: 1, wp: 0.1, wc: 0.12, band: 'Cap-only SAFEs are the default; a discount alongside a cap is uncommon [unverified].' },
  { id: 'mfn', label: 'MFN side letter', type: 'opt', wp: 0.15, wc: 0.15, band: 'MFN lets the investor take any better terms you give a later SAFE holder [sourced, YC form summary].',
    options: [{ id: 'none', label: 'No MFN', pu: 1, cu: 0.1 }, { id: 'mfn', label: 'MFN side letter', pu: 0.4, cu: 1 }] },
  { id: 'proRata', label: 'Pro rata side letter', type: 'opt', wp: 0.15, wc: 0.18, band: 'A pro rata side letter is a separate YC form; check-size dependent [sourced, secondary].',
    options: [{ id: 'none', label: 'None', pu: 1, cu: 0 }, { id: 'pr', label: 'Pro rata side letter', pu: 0.4, cu: 1 }] },
];

// ---- M&A / acquisition LOI ----
// Holdback/escrow 5-20% of price held 12-24 months; earnouts in 22% of private deals (SRS Acquiom, secondary), 20-40% of
// price in SaaS with a median 24-month period and an average payout around 21 cents on the dollar (White & Case 2025,
// secondary); LOI exclusivity commonly 30-90 days [unverified]; buyers reprice after diligence (retrade) [sourced, L40].
export const MNA = {
  holdback: [0.05, 0.2],
  holdbackMonths: [12, 24],
  earnout: [0.2, 0.4],
  earnoutMonths: 24,
  earnoutPayoutAvg: 0.21, // average earnout payout reported at 21 cents on the dollar [sourced, secondary]
  exclusivity: [30, 90],
  retradeBase: 0.12, // 10-15% chance of a material diligence retrade [design, vc-terms.md section 4]
  retradeCut: [0.05, 0.15], // price cut when a retrade lands [design]
  holdbackClaimP: 0.15, // chance of an indemnity claim against the holdback [design]
  holdbackClaimShare: 0.4, // share of the holdback a claim takes [design]
  stockHaircut: 0.25, // buyer stock valued at a discount to face [design]
};
export const MNA_ISSUES = [
  { id: 'price', label: 'Headline price', type: 'num', unit: '$', fmt: 'usd', pDir: 1, cDir: -1, wp: 0.34, wc: 0.32, band: 'Closing prices sit below asking; sub-$1M ARR trades 2.5-4x revenue (docs/research/fundraising.md).' },
  { id: 'earnout', label: 'Earnout share of price', type: 'num', unit: '%', fmt: 'pct', min: 0, max: 0.45, step: 0.05, pDir: -1, cDir: 1, wp: 0.16, wc: 0.14, band: 'Earnouts run 20-40% of price in SaaS; the average payout is ~21 cents on the dollar [sourced, secondary]. Cash at close beats contingent money.' },
  { id: 'earnoutMonths', label: 'Earnout length', type: 'opt', wp: 0.06, wc: 0.05, band: 'Median earnout period 24 months [sourced, secondary]. Longer = more time for the buyer to starve the metric.',
    options: [{ id: '12', label: '12 months', pu: 1, cu: 0 }, { id: '18', label: '18 months', pu: 0.55, cu: 0.5 }, { id: '24', label: '24 months', pu: 0, cu: 1 }] },
  { id: 'holdback', label: 'Holdback / escrow', type: 'num', unit: '%', fmt: 'pct', min: 0, max: 0.2, step: 0.05, pDir: -1, cDir: 1, wp: 0.14, wc: 0.13, band: '5-20% of price held 12-24 months; 90% of 2023 deals had some escrow [sourced, secondary].' },
  { id: 'holdbackMonths', label: 'Holdback length', type: 'opt', wp: 0.05, wc: 0.05, band: '12-24 months [sourced, secondary].',
    options: [{ id: '12', label: '12 months', pu: 1, cu: 0 }, { id: '18', label: '18 months', pu: 0.5, cu: 0.5 }, { id: '24', label: '24 months', pu: 0, cu: 1 }] },
  { id: 'stock', label: 'Buyer stock in the price', type: 'num', unit: '%', fmt: 'pct', min: 0, max: 0.3, step: 0.05, pDir: -1, cDir: 1, wp: 0.05, wc: 0.08, band: 'Stock is illiquid and valued at a discount to face [design]; some buyers prefer to pay in paper.' },
  { id: 'exclusivity', label: 'Exclusivity (no-shop)', type: 'opt', policy: true, wp: 0.12, wc: 0.1, band: 'Exclusivity commonly 30-90 days [unverified]. The longer it runs, the longer you cannot talk to anyone else while they find reasons to retrade.',
    options: [{ id: '30', label: '30 days', pu: 1, cu: 0.1 }, { id: '45', label: '45 days', pu: 0.7, cu: 0.4 }, { id: '60', label: '60 days', pu: 0.35, cu: 0.75 }, { id: '90', label: '90 days', pu: 0, cu: 1 }] },
  { id: 'retention', label: 'Founder retention', type: 'opt', wp: 0.08, wc: 0.13, band: 'Buyers of owner-dependent SaaS want the founder to stay through the transition [design].',
    options: [{ id: '0', label: 'Transition 30 days', pu: 1, cu: 0 }, { id: '6', label: 'Stay 6 months', pu: 0.7, cu: 0.5 }, { id: '12', label: 'Stay 12 months', pu: 0.3, cu: 0.8 }, { id: '24', label: 'Stay 24 months', pu: 0, cu: 1 }] },
];

// ---- Vendor contracts (buying SaaS) and hiring offers: adapter shapes ----
export const VENDOR_ISSUES = [
  { id: 'price', label: 'Annual price', type: 'num', unit: '$', fmt: 'usd', pDir: -1, cDir: 1, wp: 0.4, wc: 0.35, band: 'Vendr: ~11% average saving across 40,000+ deals (vendor data, directional).' },
  { id: 'prepay', label: 'Billing', type: 'opt', wp: 0.15, wc: 0.2, band: 'Annual prepay for 10-20% off is a standard founder ask [design].',
    options: [{ id: 'monthly', label: 'Monthly', pu: 1, cu: 0 }, { id: 'annual', label: 'Annual prepay', pu: 0.3, cu: 1 }] },
  { id: 'seats', label: 'Seat commitment', type: 'opt', wp: 0.15, wc: 0.2, band: 'Commit to spend you will use; a deeper discount on seats you will not fill is a loss [sourced, FinOps guidance].',
    options: [{ id: 'flex', label: 'Flexible (true up quarterly)', pu: 1, cu: 0 }, { id: 'right', label: 'Committed at current usage', pu: 0.6, cu: 0.5 }, { id: 'over', label: 'Committed above usage (growth tier)', pu: 0, cu: 1 }] },
  { id: 'renewCap', label: 'Renewal price cap', type: 'opt', wp: 0.2, wc: 0.15, band: 'Common cap language 3-5% a year or CPI [sourced, advice-level].',
    options: [{ id: 'none', label: 'No cap', pu: 0, cu: 1 }, { id: 'cap7', label: '7%', pu: 0.45, cu: 0.6 }, { id: 'cap5', label: '5%', pu: 0.75, cu: 0.3 }, { id: 'lock', label: 'Price lock', pu: 1, cu: 0 }] },
  { id: 'term', label: 'Term', type: 'opt', wp: 0.1, wc: 0.1, band: 'Longer term earns price, costs flexibility [design].',
    options: [{ id: '1', label: '1 year', pu: 1, cu: 0.2 }, { id: '2', label: '2 years', pu: 0.5, cu: 0.6 }, { id: '3', label: '3 years', pu: 0.1, cu: 1 }] },
  { id: 'payment', label: 'Payment terms', type: 'opt', wp: 0.05, wc: 0.1, band: 'Card or upfront is what sales reps prefer; net-30/60 invoicing is a real ask on annual deals [design].',
    options: [{ id: 'upfront', label: 'Card / due on signing', pu: 0, cu: 1 }, { id: 'net30', label: 'Net 30', pu: 0.6, cu: 0.4 }, { id: 'net60', label: 'Net 60', pu: 1, cu: 0 }] },
];

// Vendor contracts bought by the company (Money -> Stack audit). Every number marked [design] is an assumption.
export const VENDOR_NEG = {
  minMonthly: 100, // recurring vendors below this are not worth a rep's time or yours [design]
  autoRenewAnnualUsd: 1000, // an annual renewal at or above this that renews without a conversation is a logged mistake [design]
  listUplift: [0.05, 0.12], // list-price uplift on an annual renewal when nobody negotiates (Vendr/SaaS renewal reports cite high single digits) [design range]
  renewalWindowDays: 90, // reps start renewal talks about a quarter out [design]
  cooldownDays: 150, // a vendor will not reopen a price it just agreed [design]
  typicalSaving: 0.11, // Vendr: ~11% average saving across 40,000+ negotiated deals (vendor data, directional)
  maxDiscount: 0.22, // deepest discount on the table with prepay + term: prepay 15-20% (science-and-enterprise.md section 3) plus a few points for seats/term [design]
  prepayShortRunwayMonths: 6, // paying a year up front when the runway after it is under this is a logged mistake [design]
  overSeatPad: 1.3, // "growth tier" commitment: seats bought above current usage [design]
  churnWindowDays: [60, 300], // stopped using a prepaid tool inside this window of the term [design]
  idleDays: 60,
  quoteWindow: [14, 45],
};
export const HIRING_ISSUES = [
  { id: 'salary', label: 'Base salary', type: 'num', unit: '$', fmt: 'usd', pDir: -1, cDir: 1, wp: 0.45, wc: 0.4, band: 'See the People app offer negotiation (ops-data NEG).' },
  { id: 'equity', label: 'Equity grant', type: 'num', unit: '%', fmt: 'pct', min: 0, max: 0.02, step: 0.0005, pDir: -1, cDir: 1, wp: 0.2, wc: 0.2, band: 'Paper equity is discounted by most candidates [design].' },
  { id: 'signOn', label: 'Sign-on bonus', type: 'num', unit: '$', fmt: 'usd', min: 0, max: 20000, step: 500, pDir: -1, cDir: 1, wp: 0.1, wc: 0.15, band: 'One-time cost; closes small salary gaps cheaply [design].' },
  { id: 'start', label: 'Start date', type: 'opt', wp: 0.1, wc: 0.1, band: 'Notice periods vary by region [design].',
    options: [{ id: 'now', label: 'Within 2 weeks', pu: 1, cu: 0.2 }, { id: 'd30', label: '30 days', pu: 0.6, cu: 0.5 }, { id: 'd60', label: '60 days', pu: 0.2, cu: 0.9 }] },
  { id: 'remote', label: 'Work arrangement', type: 'opt', wp: 0.15, wc: 0.15, band: 'Remote flexibility is cheap for you and valuable to many candidates [design].',
    options: [{ id: 'office', label: 'On site', pu: 1, cu: 0 }, { id: 'hybrid', label: 'Hybrid', pu: 0.6, cu: 0.55 }, { id: 'remote', label: 'Fully remote', pu: 0.2, cu: 1 }] },
];

// Mistake ids by adapter (all under operator function 'negotiation'): label and a player-facing explanation.
export const NEG_MISTAKES = {
  caved_on_discount: 'Caved on discount',
  uncapped_liability_signed: 'Signed uncapped liability',
  mfn_triggered_repricing: 'MFN clause forced a repricing',
  no_give_get: 'Gave concessions without asking for anything',
  quarter_end_desperation_discount: 'Quarter-end desperation discount',
  accepted_participating_pref: 'Accepted a participating liquidation preference',
  pool_shuffle_ignored: 'Ignored the option pool shuffle',
  gave_up_board_control: 'Gave up board control',
  bluffed_competing_term_sheet: 'Bluffed a competing term sheet',
  overplayed_hand_lost_term_sheet: 'Overplayed your hand and lost the term sheet',
  long_exclusivity_retrade: 'Long exclusivity, then a retrade',
  earnout_heavy_deal: 'Earnout-heavy deal',
  overplayed_hand: 'Overplayed your hand and lost the deal',
  tfc_used: 'Customer used the termination-for-convenience right',
  bluffed_alternative: 'Bluffed an alternative you did not have',
  extreme_anchor_walk: 'Opened so far out that they walked',
  worse_than_batna: 'Took a deal worse than your alternative',
  walked_from_good_deal: 'Walked away from a deal better than your alternative',
  unreciprocated_concessions: 'Gave concessions that were pocketed',
  auto_renewed_without_negotiating: 'Annual plan auto-renewed at list with an uplift',
  prepaid_annual_then_churned_tool: 'Prepaid a year for a tool you stopped using',
  overcommitted_seats: 'Committed to seats nobody uses',
  prepay_squeezed_runway: 'Prepaid a year of software while runway was short',
};
