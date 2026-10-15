// Google scaled-content demotion hook (tiny and pure so the organic engine can read it without importing the PLG model).
// Set by plg/model.js when a core update demotes thin programmatic pages (docs/research/plg-email/p1-plg-levers.md §5).
export function seoPenaltyMult(state) {
  const s = state.apps?.plg?.seo;
  return s && s.until != null && (state.day ?? 0) < s.until ? s.siteMult ?? 1 : 1;
}
