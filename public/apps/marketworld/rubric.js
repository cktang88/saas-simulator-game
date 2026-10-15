// Battlecard / alternatives-page rubric (docs/research/judging/sales.md §7; Klue Fact-Impact-Act, talk tracks and proof points).
export const PAGE_RUBRIC = [
  { key: 'accuracy', label: 'Claims are specific and checkable', weight: 2,
    anchors: { 1: 'unsourced or exaggerated claims', 3: 'mostly checkable, a few vague', 5: 'each claim carries a number, date or feature a buyer can verify' } },
  { key: 'differentiation', label: 'Real difference vs this rival, tied to a buyer situation', weight: 2,
    anchors: { 1: '"better, faster, cheaper" with no specifics', 3: 'a feature list without buyer situations', 5: '1-3 differences each tied to when the buyer should choose us' } },
  { key: 'fairness', label: 'Honest about where the rival wins', weight: 1.5,
    anchors: { 1: 'trash talk or mockery', 3: 'no mention of the rival\'s strengths', 5: 'says where the rival is better and for whom, then why that does not apply to this buyer' } },
  { key: 'actionability', label: 'Usable on a call or by a buyer deciding', weight: 2,
    anchors: { 1: 'description only', 3: 'a talk track or questions, not both', 5: 'for likely objections: a talk track, a discovery or landmine question, and a proof point' } },
  { key: 'proof', label: 'Proof points', weight: 1,
    anchors: { 1: 'none', 3: 'a generic claim of customer success', 5: 'named customer quote, dated price comparison or screenshot reference' } },
];
