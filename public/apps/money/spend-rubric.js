// Spend-policy reader rubric (docs/research/judging/investors-people-ops.md §Spend policy).
// One criterion per policy clause (ids match POLICY_CLAUSES in spend.js). The model scores how enforceable each
// clause is 1/3/5; the GAME counts a clause as covered only at 4+ (a specific rule: an amount, a deadline, an owner).
import { rubricText } from '../../core/rubric.js';
import { rubricSchema } from '../../core/rubric-fields.js';

export const POLICY_CRITERIA = [
  { key: 'receipts', label: 'Receipt and memo deadline', anchors: { 1: '"keep your receipts" or nothing', 3: 'a deadline but no business-purpose memo and no consequence', 5: 'receipt plus business-purpose memo within a stated number of business days, a missing-receipt affidavit route, and a consequence (card frozen after N days overdue)' } },
  { key: 'approval', label: 'Approval threshold in dollars', anchors: { 1: '"use good judgment" or "get approval for big purchases"', 3: 'a dollar threshold with no named approver', 5: 'dollar thresholds (tiered if useful), who approves each tier, and pre-approval before purchase, not after' } },
  { key: 'software', label: 'New software and trials need an owner and approval', anchors: { 1: 'not mentioned', 3: 'new software needs approval, no owner or renewal rule', 5: 'every tool and trial has a named owner and approval, trials get a cancel-by date, renewals are reviewed before they bill' } },
  { key: 'travel', label: 'Travel and meals limits', anchors: { 1: '"be reasonable"', 3: 'a meal or hotel cap but not both, or no booking rule', 5: 'per-night lodging and per-person meal caps, fare class and booking window, who approves exceptions' } },
  { key: 'prohibited', label: 'Prohibited spend', anchors: { 1: 'not listed', 3: 'says personal spend is not allowed', 5: 'explicit list (personal expenses, gift cards, cash advances, alcohol limits, gambling) and what happens on a violation' } },
  { key: 'split', label: 'No split purchases', anchors: { 1: 'not mentioned', 3: 'says "do not split purchases"', 5: 'defines splitting (same vendor and purpose to stay under a limit) and says it is reviewed and treated as a violation' } },
];
export const POLICY_SCHEMA_R = rubricSchema(POLICY_CRITERIA, {
  evidence: { type: 'array', items: { type: 'string' }, description: 'For every clause scored below 4, the exact sentence (or "missing") that caused it.' },
});
export const policyRubric = () => rubricText(POLICY_CRITERIA);
/** Clause booleans for savePolicy: covered only at 4+ (a specific, enforceable rule). */
export const clausesFromScores = (data) => Object.fromEntries(POLICY_CRITERIA.map((c) => [c.key, Number(data?.[c.key]) >= 4]));
