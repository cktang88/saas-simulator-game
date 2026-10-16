// Public Legal API for other apps (owned by the Legal app). Signatures are a stable contract.

export const legalSlice = (state) => state.apps.legal ?? null;

// 'none' | 'llc' | 'ccorp' (mirrors state.company.entity).
export const entityOf = (state) => (state.company.incorporated ? state.company.entity ?? 'none' : 'none');

// Federal EIN issued (needed for payroll, bank and Stripe KYC).
export const hasEin = (state) => state.apps.legal?.ein?.status === 'done';

// A CIIAA (confidential information & invention assignment) template exists for new hires/contractors.
export const ciiaaReady = (state) => Boolean(state.apps.legal?.docs?.ciiaa);

// This person actually signed a CIIAA (a template in the offer is not a signature). New hires get `ciiaaSigned`
// (a day, or null until collected in onboarding); members created before the signature step count their flag.
export const ciiaaSigned = (m) => (m?.ciiaaSigned !== undefined ? m.ciiaaSigned != null : Boolean(m?.ciiaa));

// B2B DPA template ready (also mirrored at state.apps.legal.dpaReady).
export const dpaReady = (state) => Boolean(state.apps.legal?.dpaReady);

// 'none' | 'type1_in_progress' | 'type1' | 'type2_in_progress' | 'type2'
export const soc2Status = (state) => state.apps.legal?.soc2 ?? 'none';

// A filing (e.g. 'de-franchise-2027') was already paid by Legal or by the Books app.
export function filingPaid(state, key) {
  if (state.apps.legal?.paidFilings?.[key]) return true;
  const b = state.apps.books?.paidFilings;
  if (!b) return false;
  if (Array.isArray(b)) return b.some((x) => x === key || x?.key === key || x?.id === key);
  return Boolean(b[key]);
}

// Legal fees for a priced seed given the company's legal state (for the Fundraising app, review F20).
// issues = number of diligence red flags (legalIssues in legal/sim.js). Returns { company, investorCounselCap, total }.
export function seedLegalFees(issues = 0) {
  const company = 12000 + (issues > 0 ? 8000 : 0);
  return { company, investorCounselCap: 15000, total: company + 15000 };
}
