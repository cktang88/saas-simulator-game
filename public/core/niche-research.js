// Niche research contract shared by the browser and the server worker: dossier shape, the strict JSON schema the
// web-grounded model must fill, the prompts (progressively deeper per level) and normalisation of the answer.
// Pure: no DOM, no state.

import { FUDGE_NOTE } from './niche-disguise.js';

const S = { type: 'string' };
const SA = { type: 'array', items: S };
const RANGE = { type: 'object', additionalProperties: false, required: ['lo', 'hi'], properties: { lo: { type: 'number' }, hi: { type: 'number' } } };
const obj = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });

/** JSON schema the researcher must fill (all keys required: strict mode). */
export const RESEARCH_SCHEMA = obj({
  description: S,
  archetypes: { type: 'array', items: obj({ name: S, sizeBand: S, employees: RANGE, revenueUsd: RANGE, countInRegion: RANGE, note: S }) },
  exampleCompanies: { type: 'array', items: obj({ name: S, note: S }) },
  roles: { type: 'array', items: obj({ title: S, cares: SA }) },
  workflows: SA,
  tools: { type: 'array', items: obj({ name: S, category: S }) },
  vocabulary: SA,
  painTriggers: SA,
  incidents: SA,
  spend: obj({ problemUsdPerMonth: RANGE, softwareUsdPerMonth: RANGE, budgetNorm: S }),
  buying: obj({ process: S, signers: SA, cycleDays: RANGE }),
  communities: { type: 'array', items: obj({ name: S, kind: S, url: S }) },
  objections: SA,
  seasonality: S,
  agencies: { type: 'array', items: obj({ name: S, kind: { type: 'string', enum: ['marketing', 'recruiting', 'dev', 'pr', 'consulting', 'other'] }, pricing: S, priceUsd: RANGE, unit: S }) },
  citations: { type: 'array', items: obj({ url: S, title: S }) },
});

/** Compact JSON shape shown to the model in json_object mode. The strict RESEARCH_SCHEMA compiles to a grammar the
 *  provider rejects as too large ("compiled grammar is too large"), so the live worker uses this text + normalizeDossier. */
export const RESEARCH_SHAPE = `{"description":"2-3 sentences","archetypes":[{"name":"","sizeBand":"","employees":{"lo":0,"hi":0},"revenueUsd":{"lo":0,"hi":0},"countInRegion":{"lo":0,"hi":0},"note":""}],"exampleCompanies":[{"name":"","note":""}],"roles":[{"title":"","cares":[""]}],"workflows":[""],"tools":[{"name":"","category":""}],"vocabulary":[""],"painTriggers":[""],"incidents":[""],"spend":{"problemUsdPerMonth":{"lo":0,"hi":0},"softwareUsdPerMonth":{"lo":0,"hi":0},"budgetNorm":""},"buying":{"process":"","signers":[""],"cycleDays":{"lo":0,"hi":0}},"communities":[{"name":"","kind":"","url":""}],"objections":[""],"seasonality":"","agencies":[{"name":"","kind":"marketing|recruiting|dev|pr|consulting|other","pricing":"","priceUsd":{"lo":0,"hi":0},"unit":"per month|per project|per hire"}],"citations":[{"url":"","title":""}]}`;

export const RESEARCH_SYSTEM = `You are a meticulous B2B market researcher with live web search. You describe ONE specific customer niche so a business simulation can feel real. Use only what you find evidence for. Source order: primary and credible sources first (industry and professional associations, government and regulator data, vendor pricing pages, published industry reports), then trade press and practitioner forums; avoid agency blogs, "top 10" listicles and affiliate roundups as citations. Rules:
- Prefer market-level facts (sizes, prices, tools, regulation, how buying works) over anecdotes about named companies; use a named company only when it adds something a market fact cannot.
- Never include street addresses or person names (no owners, founders, executives, clinicians), no emails, phone numbers or personal profiles.
- Describe the niche in general; never name private individuals.
- Real software vendors, real public communities, associations, events and newsletters may be named exactly. Real example companies and agencies may be named (they are disguised later), but give 3 to 6 only.
- Money is US dollars. Ranges are {lo, hi} and must be plausible for the niche; use best estimates when a source gives none.
- Incidents are short anonymised stories of what went wrong (one or two sentences each).
- Put the source pages you used in citations (real URLs only, never invented).
- Be concrete and specific to the niche, not generic to the broader industry.
- Keep it compact: at most 5 items per list, one short sentence per item.
- Reply with ONE JSON object only (no prose, no markdown) in exactly this shape, every key present:
${RESEARCH_SHAPE}`;

const FOCUS = [
  'Cover the whole niche at a glance: who they are, company sizes and counts, who works there, the tools category, where they gather, how they buy, and who serves them.',
  'Go deeper than the parent niche: the daily workflows, the exact jargon people use, what triggers pain, real anonymised incidents, what they spend on the problem today, and the objections a software seller hears.',
  'Go much deeper on this narrow slice: specific incidents, trigger events, local conditions, exact tools in use and their typical limitations, who the real decision maker is, local associations and events, and which agencies or consultants specialise here with their prices.',
];

/** The user message for a research call. depth = node level (1 = base segment). seedFacts: what the offline dossier already says. */
export function researchPrompt({ nodePath = [], depth = 1, seedFacts = null }) {
  const labels = nodePath.map((p) => (typeof p === 'string' ? p : p.label)).filter(Boolean);
  const niche = labels.length ? labels.join(' > ') : 'unspecified niche';
  const lastText = labels[labels.length - 1] ?? niche;
  const seed = seedFacts ? `\nWhat we already assume (correct it with evidence, do not just repeat it):\n${JSON.stringify(seedFacts).slice(0, 2500)}` : '';
  return `Research the niche "${lastText}" (full path: ${niche}). Level ${depth} of detail. ${FOCUS[Math.min(FOCUS.length - 1, Math.max(0, depth - 1))]}\nWho buys software here, what their business looks like, how they find and evaluate vendors, which agencies and consultants serve them and what those cost (late 2026 US unless the path says otherwise).${seed}`;
}

// ---------------------------------------------------------------- normalisation

const str = (v, n = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (v, n, len = 300) => (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter(Boolean).slice(0, n);
function range(v, min = 0) {
  let lo = Number(v?.lo), hi = Number(v?.hi);
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) return { lo: min, hi: min };
  if (!Number.isFinite(lo)) lo = hi; if (!Number.isFinite(hi)) hi = lo;
  lo = Math.max(min, lo); hi = Math.max(min, hi);
  return lo <= hi ? { lo, hi } : { lo: hi, hi: lo };
}
const AGENCY_KINDS = new Set(['marketing', 'recruiting', 'dev', 'pr', 'consulting', 'other']);

/** Coerce any dossier-like object (researched or offline) into the canonical shape, clipped to a safe size. */
export function normalizeDossier(d = {}) {
  return {
    description: str(d.description, 700),
    archetypes: (d.archetypes ?? []).slice(0, 6).map((a) => ({ name: str(a.name, 120), sizeBand: str(a.sizeBand, 80), employees: range(a.employees, 1), revenueUsd: range(a.revenueUsd), countInRegion: range(a.countInRegion), note: str(a.note, 300) })),
    exampleCompanies: (d.exampleCompanies ?? []).slice(0, 8).map((c) => ({ name: str(c.name, 80), note: str(c.note, 200) })).filter((c) => c.name),
    roles: (d.roles ?? []).slice(0, 8).map((r) => ({ title: str(r.title, 80), cares: list(r.cares, 5, 160) })).filter((r) => r.title),
    workflows: list(d.workflows, 8), tools: (d.tools ?? []).slice(0, 14).map((t) => ({ name: str(t.name, 60), category: str(t.category, 60) })).filter((t) => t.name),
    vocabulary: list(d.vocabulary, 14, 60), painTriggers: list(d.painTriggers, 8), incidents: list(d.incidents, 8, 400),
    spend: { problemUsdPerMonth: range(d.spend?.problemUsdPerMonth), softwareUsdPerMonth: range(d.spend?.softwareUsdPerMonth), budgetNorm: str(d.spend?.budgetNorm, 300) },
    buying: { process: str(d.buying?.process, 500), signers: list(d.buying?.signers, 5, 100), cycleDays: range(d.buying?.cycleDays) },
    communities: (d.communities ?? []).slice(0, 10).map((c) => ({ name: str(c.name, 100), kind: str(c.kind, 40), url: str(c.url, 200) })).filter((c) => c.name),
    objections: list(d.objections, 8), seasonality: str(d.seasonality, 300),
    agencies: (d.agencies ?? []).slice(0, 8).map((a) => ({ name: str(a.name, 80), kind: AGENCY_KINDS.has(a.kind) ? a.kind : 'other', pricing: str(a.pricing, 200), priceUsd: range(a.priceUsd), unit: str(a.unit, 40) })).filter((a) => a.name),
    citations: (d.citations ?? []).filter((c) => /^https?:\/\//.test(c?.url ?? '')).slice(0, 12).map((c) => ({ url: str(c.url, 300), title: str(c.title, 120) })),
    fudge: str(d.fudge, 400) || FUDGE_NOTE,
  };
}
