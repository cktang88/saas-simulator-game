// One stable hidden person per CRM contact, drawn from the hidden market truth (core/truth.js).
// The same facts (pain, budget authority, true WTP, the idiosyncratic ask) answer in sales replies, calls, pre-sell,
// and research (apps/research.js can import personForContact). Warm intros change politeness only: pain is a
// property of the person's segment and never of how you reached them (docs/research/early-stage/misleading-feedback.md).
import { segmentMatch, drawPerson, truthOf, icpFocus } from '../../core/truth.js';
import { hash } from '../../core/util.js';

const u01 = (s) => (parseInt(hash(s), 36) % 100000) / 100000;
const cache = new WeakMap(); // contact object -> { t, warm, screened, person }

const crmOf = (state) => state.apps?.crm ?? { companies: [], contacts: [] };
const companyFor = (state, contact, company) => company ?? crmOf(state).companies.find((c) => c.id === contact?.companyId) ?? {};

/** Is there a market idea to ground against? Without one (empty one-liner) callers keep their legacy behaviour. */
export const hasTruth = (state) => Boolean((state.company?.oneLiner ?? '').trim());

/** Text that says who this contact is: industry, size, title, company name, site title. */
export function contactText(contact, company = {}) {
  return [company.industry, company.size, contact?.title, company.name, company.prospect?.segLabel, company.site?.title, company.site?.description, company.notes].filter(Boolean).join(' ');
}

/** The TRUE segment this contact belongs to ('outsider' when no segment's keywords match). */
export function segmentForContact(state, contact, company = null) {
  const co = companyFor(state, contact, company);
  const hits = segmentMatch(state, contactText(contact, co));
  if (hits[0] && hits[0].score >= 0.25) return hits[0].segmentId;
  // Nothing describes this contact at all (no industry, size or site): they came off a list built for your ICP, so draw
  // from the segments you target. A contact that IS described but matches no segment is a real outsider.
  const described = Boolean(co.industry || co.size || co.site?.title || co.prospect?.segLabel);
  return described ? 'outsider' : segmentFromFocus(state, contact?.id ?? contact?.email ?? 'anon');
}

/**
 * The stable hidden person behind a CRM contact: drawPerson facts + segmentId. Same contact = same facts, whether
 * you meet them by cold email, a call, a pre-sell ask or a research interview. Inbound leads self-selected (a
 * screener-like filter on pain). Warm only changes the relationship (politeness).
 */
export function personForContact(state, contact, company = null) {
  const co = companyFor(state, contact, company);
  const t = truthOf(state);
  const warm = Boolean(contact?.warm);
  const screened = Boolean(co.inboundFit != null || contact?.source === 'inbound' || contact?.status === 'inbound');
  const hit = cache.get(contact);
  if (hit && hit.t === t && hit.warm === warm && hit.screened === screened) return hit.person;
  const segmentId = segmentForContact(state, contact, co);
  const key = contact?.id ?? contact?.email ?? co.domain ?? 'anon';
  // channel is fixed ('cold') so the random stream, hence every fact except politeness, is identical for warm and cold.
  const person = drawPerson(state, { segmentId, channel: 'cold', seedKey: `contact:${key}`, screened, relationship: warm ? 'warm' : null });
  if (contact) cache.set(contact, { t, warm, screened, person });
  return person;
}

/** A segment drawn (stably, by seed) from the segments you actually sell to. */
function segmentFromFocus(state, seed) {
  const focus = icpFocus(state);
  const entries = Object.entries(focus.valueWeights ?? focus.weights ?? {}).filter(([, w]) => w > 0);
  if (entries.length) {
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let x = u01(`seg:${seed}`) * total;
    for (const [id, w] of entries) { x -= w; if (x <= 0) return id; }
    return entries.at(-1)[0];
  }
  const segs = truthOf(state).segments;
  return segs.length ? segs[Math.floor(u01(`seg:${seed}`) * segs.length) % segs.length].id : 'outsider';
}

/** Person facts for a paying customer: the CRM contact if there is one, else a draw from the segments you actually sell to. */
export function personForCustomer(state, customer, { loud = false } = {}) {
  const crm = crmOf(state);
  const ct = customer?.email ? crm.contacts.find((c) => c.email === customer.email) : null;
  if (ct && !loud) return personForContact(state, ct);
  // People who pay for it chose it: screened. The biggest account gets idiosyncratic asks (it is custom-wired into them).
  return drawPerson(state, { segmentId: segmentFromFocus(state, customer?.id), channel: 'cold', seedKey: `cust:${customer?.id}`, screened: true, idiosyncratic: loud ? true : null });
}

/** What a prospect's authority reads as, from the hidden facts (not their title). */
export function authorityOfPerson(person) {
  if (!person) return 'end user with no buying authority';
  if (person.isBuyer && person.budgetAuthority) return 'economic buyer';
  if (person.isBuyer) return 'budget influencer / likely champion';
  if (person.role === 'outsider') return 'end user with no buying authority';
  return 'champion without budget';
}
