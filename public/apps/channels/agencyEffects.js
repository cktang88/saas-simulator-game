// What a hired niche agency or vendor actually does inside the systems it works on (engine: ./agencies.js outcomeOf):
//   marketing agency -> organic traffic every day plus content drafts for the SEO queue (growth/seoDynamics.js)
//   PR firm          -> earned links (domain rating) and citable press mentions (growth/organicEngine.js)
//   dev shop         -> extra product build hours whose bug rate follows the firm's defect rate (apps/product.js build)
//   data vendor      -> a contact list whose email accuracy follows the vendor's quality (sales/prospector.js)
// Hidden quality shows only through these outputs. Scammy firms deliver nothing; mediocre ones deliver a little, and
// agencyDay (agencies.js) logs the waste against the system it landed in. Numbers tagged [design] are game assumptions.

import { outcomeOf } from './agencies.js';
import { notify } from '../../core/state.js';
import { clamp, round2 } from '../../core/util.js';
import { ensureSeo, addLinks, makeDraft, pickQuery, SEO_DYN } from '../growth/seoDynamics.js';

export const EFFECT = {
  marketing: { visitsPerDay: 12, draftEveryDays: 15 }, // visits per day at leadsMult 1; one content draft per fortnight [design]
  pr: { dayStep: 1 }, // placements arrive at placements / (months * 30) per day [design]
  dev: { defectBaseline: 0.2, bugMultRange: [0.5, 2.2] }, // a median engineer's defect rate maps to a x1 bug multiplier [design]
  data: { perUnit: 50, maxRows: 400, deliverDay: 7 }, // contacts per 1,000 purchased; the game's list sizes are scaled down [design]
};

// A firm whose true effectiveness is near zero (scams, no-shows) does no real work even before it goes quiet.
const NOTHING = 0.1;
const live = (state, e) => {
  if (e.status !== 'active') return false;
  if (e.recurringId) { const r = (state.recurring ?? []).find((x) => x.id === e.recurringId); if (r && !r.active) return false; }
  else if (e.months && state.day - e.startDay > e.months * 30) return false; // prepaid term is over
  return state.day > e.startDay;
};

/** Daily: marketing agencies bring visitors and content, PR firms earn links and mentions. `visit(source, n)` books traffic. */
export function marketingPrDay(state, visit) {
  const B = state.agencyBook;
  if (!B?.engagements?.length) return;
  for (const e of B.engagements) {
    if ((e.kind !== 'marketing' && e.kind !== 'pr') || !live(state, e)) continue;
    const l = B.listings[e.listingId];
    const o = outcomeOf(state, e.id);
    const age = state.day - e.startDay;
    const S = ensureSeo(state), O = state.apps.organic;
    if (e.kind === 'marketing') {
      e.visitAcc = (e.visitAcc ?? 0) + (o.effectiveness < NOTHING ? 0 : EFFECT.marketing.visitsPerDay * o.leadsMult);
      const n = Math.floor(e.visitAcc);
      if (n > 0) { e.visitAcc -= n; e.visits = (e.visits ?? 0) + n; visit('organic:agency', n); }
      if (o.effectiveness >= NOTHING && age % EFFECT.marketing.draftEveryDays === 0) {
        const i = e.drafts = (e.drafts ?? 0) + 1;
        const ef = o.effectiveness, brief = e.briefScore ?? 0.5;
        makeDraft(state, { source: `niche_agency:${l.name}`, tier: 'agency', query: pickQuery(state, 'mixed', i), q: [clamp(ef * 0.8 - 0.1, 0.05, 0.9), clamp(ef * 0.8 + 0.1, 0.1, 0.9)], slopP: round2((1 - ef) * 0.5), errP: round2((1 - ef) * 0.15), briefScore: brief, dueDay: state.day, autoPublish: true, editHours: 1, u: [(i * 0.37) % 1, (i * 0.61) % 1, (i * 0.83) % 1] });
      }
    } else if (o.effectiveness >= NOTHING) {
      e.prAcc = (e.prAcc ?? 0) + o.placements / Math.max(1, e.months * 30);
      const n = Math.floor(e.prAcc);
      if (n > 0) {
        e.prAcc -= n; e.placed = (e.placed ?? 0) + n;
        addLinks(O, n, SEO_DYN.links.prGain);
        S.links.earned += n;
        O.citations = (O.citations ?? 0) + n; // press mentions that answer engines can cite
        notify(state, `${l.name} landed ${n} press mention${n > 1 ? 's' : ''} with a link (domain rating now ${Math.round(O.dr)}).`, { type: 'good', app: 'organic' });
      }
    }
  }
}

/** Today's outsourced build hours and their bug multiplier (the caller runs product build() with them). */
export function vendorBuildToday(state) {
  const B = state.agencyBook;
  let hours = 0, w = 0;
  const ids = [];
  for (const e of B?.engagements ?? []) {
    if (e.kind !== 'dev' || !live(state, e)) continue;
    const o = outcomeOf(state, e.id);
    if (o.effectiveness < NOTHING) continue;
    const h = (e.units * o.scopeDelivered) / 28; // the engagement's hours spread over its four weeks
    hours += h; w += h * clamp(o.defectRate / EFFECT.dev.defectBaseline, ...EFFECT.dev.bugMultRange); ids.push(e.id);
  }
  return { hours: round2(hours), bugMult: hours ? round2(w / hours) : 1, ids };
}
export function vendorBuildDone(state, ids, hours, idle) {
  for (const e of state.agencyBook?.engagements ?? []) if (ids.includes(e.id)) e[idle ? 'idleHours' : 'deliveredHours'] = round2((e[idle ? 'idleHours' : 'deliveredHours'] ?? 0) + hours / ids.length);
}

/** Data vendors deliver once: a list whose email accuracy follows quality. `importList(opts)` is prospector's importVendorList. */
export function vendorListsDay(state, importList) {
  const B = state.agencyBook;
  for (const e of B?.engagements ?? []) {
    if (e.kind !== 'data' || e.listDelivered || e.status === 'ghosted' || state.day - e.startDay < EFFECT.data.deliverDay) continue;
    const l = B.listings[e.listingId];
    const o = outcomeOf(state, e.id);
    e.listDelivered = state.day;
    if (o.effectiveness < NOTHING) { e.listId = null; continue; } // nothing arrives; agencyDay logs the loss when they vanish
    const list = importList({ count: Math.min(EFFECT.data.maxRows, Math.round(e.units * EFFECT.data.perUnit)), validRate: o.validRate, vendor: l.name, niche: l.nicheLabel, name: `${l.name} list` });
    e.listId = list?.id ?? null;
    notify(state, `${l.name} delivered ${list?.contactIds.length ?? 0} contacts. Vendors advertise accuracy they rarely hit.`, { type: 'info', app: 'crm' });
  }
}
