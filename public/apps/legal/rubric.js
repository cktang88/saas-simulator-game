// Redline-response rubric (docs/research/judging/sales.md §6; Common Paper Cloud Service Agreement positions).
export const REDLINE_RUBRIC = [
  { key: 'market_standard', label: 'Positions match market-standard SaaS terms', weight: 2.5,
    anchors: { 1: 'accepts uncapped or "any claims" exposure, or strikes standard terms', 3: 'mixed: some standard positions, some one-sided', 5: 'every position within Common Paper/Bonterms norms (cap tied to 12 months of fees, higher cap for data claims, IP indemnity)' } },
  { key: 'reasoned', label: 'Each contested position is explained', weight: 2,
    anchors: { 1: 'bare refusal or no cover note', 3: 'reasons on some clauses', 5: 'a one-line reason on each contested clause that names the standard or the real constraint' } },
  { key: 'trade_offs', label: 'Offers an alternative that meets my stated fear', weight: 1.5,
    anchors: { 1: 'concedes or refuses everything, offers nothing back', 3: 'some alternatives', 5: 'a capped or scoped alternative per contested clause that answers the customer\'s actual concern' } },
  { key: 'honorable', label: 'Only commits to what the vendor can deliver', weight: 2,
    anchors: { 1: 'commits to what cannot be delivered (EU-only everywhere, no subprocessors, uncapped liability)', 3: 'commits with caveats', 5: 'commits only to what it can show today (SOC 2 status, DPA, subprocessor list)' } },
  { key: 'responsiveness', label: 'Answers what I asked', weight: 1,
    anchors: { 1: 'ignores or sidesteps asks', 3: 'answers most', 5: 'answers every ask directly' } },
];
