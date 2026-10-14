// Public Legal API for other apps (owned by the Legal app). Signatures are a stable contract.

export const legalSlice = (state) => state.apps.legal ?? null;

// 'none' | 'llc' | 'ccorp' (mirrors state.company.entity).
export const entityOf = (state) => (state.company.incorporated ? state.company.entity ?? 'none' : 'none');

// Federal EIN issued (needed for payroll, bank and Stripe KYC).
export const hasEin = (state) => state.apps.legal?.ein?.status === 'done';

// A CIIAA (confidential information & invention assignment) template exists for new hires/contractors.
export const ciiaaReady = (state) => Boolean(state.apps.legal?.docs?.ciiaa);

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
