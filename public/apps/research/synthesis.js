// Structured synthesis. Every insight carries WHO said it (revealed segment, role, relationship) and WHAT KIND of
// evidence it is (past behaviour, workaround cost, commitment, versus feature wish, hypothetical, opinion, compliment).
// The board never counts themes by keyword: it counts people, by segment, by what they did or paid. The player tags,
// merges and excludes insights and writes pattern claims; a claim is graded on what it cites (segment-specific,
// behaviour-based, enough distinct strangers) and that grade is the synthesis quality that feeds product evidence.
//
// Sources: docs/research/early-stage/pmf-process.md (synthesis, saturation), misleading-feedback.md (opinion vs
// behaviour, politeness by relationship, loud single customers), recruiting-interviews.md. Weights are [design].

import { clamp, uid, words } from '../../core/util.js';
import { truthOf, segmentMatch } from '../../core/truth.js';
import { disc, mean, median } from './store.js';

export const EVIDENCE = {
  commitment: { label: 'Commitment (costs them something)', weight: 1, behavioural: true },
  workaround_cost: { label: 'Workaround cost they already pay', weight: 0.85, behavioural: true },
  behaviour: { label: 'Past behaviour', weight: 0.75, behavioural: true },
  feature_wish: { label: 'Feature wish', weight: 0.25, behavioural: false },
  hypothetical: { label: 'Hypothetical ("I would…")', weight: 0.15, behavioural: false },
  opinion: { label: 'Opinion', weight: 0.1, behavioural: false },
  compliment: { label: 'Compliment', weight: 0.05, behavioural: false },
};
export const EVIDENCE_IDS = Object.keys(EVIDENCE);
export const isBehavioural = (t) => EVIDENCE[t]?.behavioural === true;
export const CLOSE = new Set(['friend', 'family', 'warm']);
export const COMMIT_RANK = { none: 0, followup: 1, intro: 2, pilot: 3, loi: 4, preorder: 5, deposit: 5 };
export const STRONG_LEVEL = 2; // intro or better costs the interviewee something
export const RECENT_DAYS = 14;

const HYPO = /\b(would|might|could|if (you|we|it)|probably|someday|in the future|going to|i'?d)\b/i;
const COMPLIMENT = /\b(love|great idea|sounds (great|amazing|cool)|awesome|brilliant|congrats|proud|good luck|amazing)\b/i;
const PAST = /\b(last (time|week|month|quarter)|yesterday|ago|spent|paid|pay|paying|tried|used|uses|lost|switched|hired|built|did|currently|every (week|month|day)|\d)/i;

/** Evidence type of free text (honour-system notes, LLM-extracted insights). */
export function classifyEvidence(text, type = '') {
  const t = String(text ?? '');
  if (type === 'commitment') return 'commitment';
  if (COMPLIMENT.test(t) && !PAST.test(t)) return 'compliment';
  if (HYPO.test(t) && !PAST.test(t)) return 'hypothetical';
  if (type === 'spend' && /\$|\d/.test(t)) return 'workaround_cost';
  if (type === 'request') return 'feature_wish';
  if (PAST.test(t)) return 'behaviour';
  return 'opinion';
}

const relOf = (channel) => ({ friends: 'friend', family: 'friend', warm: 'warm' }[channel] ?? 'stranger');
const jobLabelOf = (h) => h.claimJob ?? (h.jobsRanked ?? []).find((j) => !j.decoy)?.label ?? 'The core problem';

// ---------------------------------------------------------------- from a simulated interview

/** Insights the player can write down after a simulated call: only what the person actually said. */
export function insightsFromSim(state, iv) {
  const h = iv.hidden ?? {};
  const out = [];
  const theme = jobLabelOf(h);
  const base = {
    interviewId: iv.id, verified: true, simulated: true, day: state.day, who: `${iv.persona.name}${iv.persona.company ? `, ${iv.persona.company}` : ''}`,
    segmentId: iv.profile?.segmentId ?? null, segmentLabel: iv.profile?.segmentLabel ?? null, role: iv.profile?.title ?? null, relationship: iv.profile?.relationship ?? 'stranger',
  };
  const msgs = iv.messages;
  for (let k = 0; k < msgs.length; k++) {
    const m = msgs[k];
    if (m.from !== 'them' || k === 0) continue;
    const q = msgs[k - 1];
    const rev = m.revealed?.[0];
    const add = (o) => out.push({ id: uid('ins'), ...base, ...o });
    if (rev === 'lastIncident') add({ theme, text: m.text, type: 'pain', evidenceType: 'behaviour', real: true, incidentDays: h.lastIncident });
    else if (rev === 'workaround') add({ theme, text: m.text, type: 'workaround', evidenceType: 'behaviour', real: true });
    else if (rev === 'spend') add({ theme, text: m.text, type: 'spend', evidenceType: (h.workaroundCostMonthly ?? 0) > 0 ? 'workaround_cost' : 'behaviour', real: true, amount: h.workaroundCostMonthly ?? 0 });
    else if (rev === 'frequency') add({ theme, text: m.text, type: 'pain', evidenceType: 'behaviour', real: true, frequency: h.frequency });
    else if (rev === 'decision') add({ theme: 'Buying process', text: m.text, type: 'behavior', evidenceType: 'behaviour', real: true, buyer: !!h.budgetAuthority });
    else if (rev === 'priorities') add({ theme: 'Priorities', text: m.text, type: 'behavior', evidenceType: 'behaviour', real: !!h.hasPain, negative: !h.hasPain });
    else if (rev === 'idiosyncraticAsk') add({ theme: 'Custom request', text: m.text, type: 'request', evidenceType: 'feature_wish', real: true, ask: h.idiosyncraticAsk });
    else if (!rev && ['past_specific', 'open_followup'].includes(q?.qtype) && !h.hasPain && !h.fraud && /\b(can'?t think|nothing recent|not that i can|never really|don'?t think there)/i.test(m.text)) add({ theme, text: m.text, type: 'pain', evidenceType: 'behaviour', real: false, negative: true });
    if (m.statedWtp != null) add({ theme: 'Willingness to pay', text: m.text, type: 'spend', evidenceType: 'hypothetical', real: false, amount: m.statedWtp, stated: true });
    if (COMMIT_RANK[m.commitment] >= STRONG_LEVEL) add({ theme: 'Commitments', text: `${m.text}`, type: 'commitment', evidenceType: 'commitment', real: true, level: m.commitment, verified: !h.fraud });
    else if (m.commitment === 'followup') add({ theme: 'Commitments', text: m.text, type: 'behavior', evidenceType: 'opinion', real: false, level: 'followup' });
    if (!rev && !m.statedWtp && m.commitment === 'none' && ['positive', 'polite'].includes(m.sentiment) && ['hypothetical', 'leading', 'pitch', 'feature_request', 'generic', 'small_talk'].includes(q?.qtype)) {
      add({ theme: 'Opinion', text: m.text, type: 'opinion', evidenceType: CLOSE.has(base.relationship) ? 'compliment' : HYPO.test(m.text) ? 'hypothetical' : 'opinion', real: false });
    }
  }
  return out.slice(0, 12);
}

/** Fill structured fields on insights created elsewhere (honour-system notes, LLM extraction, rehearsals). Idempotent. */
export function enrichInsights(state) {
  const r = disc(state);
  for (const i of r.insights) {
    if (i.evidenceType) continue;
    const iv = r.interviews.find((x) => x.id === i.interviewId);
    i.evidenceType = classifyEvidence(i.text, i.type);
    if (!iv) continue;
    i.relationship = iv.sim ? iv.profile.relationship : relOf(iv.channel);
    if (iv.sim) { i.segmentId = iv.profile.segmentId; i.role = iv.profile.title; i.segmentLabel = iv.profile.segmentLabel; continue; }
    const guess = segmentMatch(state, `${iv.persona.role ?? ''} ${iv.persona.company ?? ''}`).find((x) => x.score >= 0.3);
    if (guess) { i.segmentId = guess.segmentId; i.segmentLabel = truthOf(state).segments.find((s) => s.id === guess.segmentId)?.label ?? guess.segmentId; }
    i.role = iv.persona.role ?? null;
  }
}

// ---------------------------------------------------------------- board

const done = (state) => disc(state).interviews.filter((i) => i.real && i.status === 'done' && !i.excluded && !i.unmasked && !i.rehearsal)
  .sort((a, b) => (a.doneDay ?? 0) - (b.doneDay ?? 0));

/** One row per completed real conversation: what the player knows about who they spoke to and what came out. */
export function personRows(state) {
  enrichInsights(state);
  const r = disc(state);
  return done(state).map((iv) => {
    const ins = r.insights.filter((i) => i.interviewId === iv.id && !i.excluded && !i.rehearsal);
    const beh = ins.filter((i) => i.evidenceType === 'behaviour' && !i.negative && i.real !== false || i.evidenceType === 'workaround_cost');
    const incident = ins.find((i) => i.incidentDays != null);
    const cost = ins.find((i) => i.evidenceType === 'workaround_cost' && Number.isFinite(i.amount));
    const stated = ins.find((i) => i.stated && Number.isFinite(i.amount));
    const commit = Math.max(0, ...ins.filter((i) => i.evidenceType === 'commitment' && i.verified !== false).map((i) => COMMIT_RANK[i.level] ?? COMMIT_RANK[(iv.grade?.commitments ?? [])[0]] ?? STRONG_LEVEL), ...(iv.sim ? [] : (iv.grade?.commitments ?? []).map((c) => COMMIT_RANK[c] ?? 0)));
    const sentiments = (iv.messages ?? []).filter((m) => m.from === 'them' && m.sentiment).map((m) => m.sentiment);
    return {
      id: iv.id, doneDay: iv.doneDay ?? 0, name: iv.persona.name, segmentId: iv.sim ? iv.profile.segmentId : (ins.find((i) => i.segmentId)?.segmentId ?? null), segmentLabel: iv.sim ? iv.profile.segmentLabel : (ins.find((i) => i.segmentLabel)?.segmentLabel ?? null),
      role: iv.sim ? iv.profile.title : iv.persona.role, relationship: iv.sim ? iv.profile.relationship : relOf(iv.channel), sim: !!iv.sim,
      behaviour: beh.length > 0, incidentDays: incident?.incidentDays ?? null, recent: incident ? incident.incidentDays <= RECENT_DAYS : beh.length > 0,
      negative: ins.some((i) => i.negative), cost: cost ? cost.amount : null, stated: stated ? stated.amount : null, commit,
      themes: [...new Set(ins.filter((i) => i.real && i.theme && !['Priorities', 'Buying process', 'Commitments', 'Willingness to pay', 'Opinion'].includes(i.theme)).map((i) => i.theme))],
      frequency: ins.find((i) => i.frequency)?.frequency ?? null,
      asks: ins.filter((i) => i.evidenceType === 'feature_wish').map((i) => i.ask ?? i.text),
      positive: sentiments.length ? sentiments.filter((s) => ['positive', 'polite'].includes(s)).length / sentiments.length : 0,
      close: CLOSE.has(iv.sim ? iv.profile.relationship : relOf(iv.channel)),
    };
  });
}

const frequencyWord = { daily: 'every day', weekly: 'weekly', monthly: 'monthly', rare: 'a few times a year' };

export function boardOf(state) {
  const rows = personRows(state);
  const t = truthOf(state);
  const labelOf = (id) => (id == null ? 'Unclassified' : id === 'outsider' ? 'Outside your target market' : (t.segments.find((s) => s.id === id)?.label ?? id).split(':').slice(0, 2).join(',').replace(/\([^)]*\)/g, '').trim());
  const bySeg = new Map();
  for (const p of rows) { const k = p.segmentId ?? 'none'; if (!bySeg.has(k)) bySeg.set(k, []); bySeg.get(k).push(p); }
  const segments = [...bySeg.entries()].map(([id, list]) => {
    const describing = list.filter((p) => p.behaviour && !p.negative);
    const recent = list.filter((p) => p.behaviour && p.recent);
    const themes = {};
    for (const p of describing) for (const th of p.themes) themes[th] = (themes[th] ?? 0) + 1;
    const topTheme = Object.entries(themes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const costs = list.map((p) => p.cost).filter((x) => x != null && x > 0);
    const stated = list.map((p) => p.stated).filter((x) => x != null && x > 0);
    const freqs = {}; for (const p of describing) if (p.frequency) freqs[p.frequency] = (freqs[p.frequency] ?? 0) + 1;
    const freq = Object.entries(freqs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const roles = [...new Set(list.map((p) => p.role).filter(Boolean))].slice(0, 2).join(' / ').toLowerCase();
    const commits = list.filter((p) => p.commit >= STRONG_LEVEL).length;
    const closeShare = list.filter((p) => p.close).length / list.length;
    const label = labelOf(id === 'none' ? null : id);
    return {
      id, label, n: list.length, describing: describing.length, recent: recent.length, negative: list.filter((p) => p.negative).length, commits, costMedian: median(costs), statedMedian: median(stated),
      frequency: freq ? frequencyWord[freq] ?? freq : null, topTheme, closeShare: Math.round(closeShare * 100) / 100,
      sentence: topTheme
        ? `${recent.length} of ${list.length} ${roles || 'people'} at ${label.toLowerCase()} described "${topTheme.toLowerCase()}" in the last ${RECENT_DAYS} days${freq ? ` (${frequencyWord[freq] ?? freq})` : ''}${commits ? `; ${commits} committed to a next step that costs them something` : ''}`
        : `${list.length} ${roles || 'people'} at ${label.toLowerCase()}: nobody described a recent, specific instance`,
      flags: [...(list.length < 3 ? ['n < 3: a story, not a pattern'] : []), ...(closeShare >= 0.5 ? ['mostly friends and warm contacts: expect politeness'] : []), ...(statedMedian(stated, costs) ? ['stated willingness to pay far above what they pay today'] : [])],
    };
  }).sort((a, b) => b.n - a.n);

  // Saturation: do new interviews still add new jobs? Counted per theme in order of interview.
  const seen = new Set(); const newPer = [];
  for (const p of rows) { const fresh = p.themes.filter((th) => !seen.has(th)); fresh.forEach((th) => seen.add(th)); newPer.push(fresh.length); }
  const last3 = newPer.slice(-3);
  const saturation = { interviews: rows.length, themes: seen.size, newPerInterview: newPer, saturated: rows.length >= 6 && last3.length === 3 && last3.every((x) => x === 0) };

  // Asks: one account asking is a story; several accounts in the same segment is a pattern.
  const askMap = new Map();
  for (const p of rows) for (const a of new Set(p.asks)) { const k = String(a).toLowerCase().replace(/\W+/g, ' ').trim(); const e = askMap.get(k) ?? { text: a, people: [] }; e.people.push(p); askMap.set(k, e); }
  const asks = [...askMap.values()].map((e) => ({ text: e.text, count: e.people.length, segments: [...new Set(e.people.map((p) => p.segmentId))], flag: e.people.length === 1 ? 'only one account asked for this' : null }));

  // Contradictions: mixed segments, stated vs paid, friends vs strangers.
  const contradictions = [];
  for (const s of segments) if (s.n >= 4 && s.describing / s.n > 0.25 && s.describing / s.n < 0.75) contradictions.push(`${s.label}: ${s.describing} of ${s.n} describe the problem and ${s.negative} say it is fine. Is it a sub-segment, or two different customers?`);
  for (const s of segments) if (s.statedMedian && s.costMedian && s.statedMedian > 2 * s.costMedian) contradictions.push(`${s.label}: people SAY they would pay about $${Math.round(s.statedMedian)}/mo but pay about $${Math.round(s.costMedian)}/mo for their workaround today. Trust what they pay.`);
  const close = rows.filter((p) => p.close); const strangers = rows.filter((p) => !p.close);
  if (close.length >= 2 && strangers.length >= 2) {
    const cPos = mean(close.map((p) => p.positive)); const sBeh = strangers.filter((p) => p.behaviour).length / strangers.length;
    if (cPos >= 0.6 && sBeh <= 0.35) contradictions.push('Friends and warm contacts are enthusiastic; strangers mostly are not describing the problem. Enthusiasm from people who like you is not demand.');
  }

  const all = disc(state).insights.filter((i) => !i.excluded && !i.rehearsal && i.evidenceType);
  const byType = Object.fromEntries(EVIDENCE_IDS.map((k) => [k, all.filter((i) => i.evidenceType === k).length]));
  const behaviourN = EVIDENCE_IDS.filter(isBehavioural).reduce((a, k) => a + byType[k], 0);
  const opinionN = all.length - behaviourN;
  return { people: rows.length, segments, saturation, asks, contradictions, evidence: { byType, behaviour: behaviourN, opinion: opinionN }, rows };
}
const statedMedian = (stated, costs) => stated.length >= 2 && costs.length >= 2 && median(stated) > 2 * median(costs);

// ---------------------------------------------------------------- player actions on the board

export function tagInsight(state, id, patch) {
  const i = disc(state).insights.find((x) => x.id === id);
  if (!i) throw new Error('Insight not found.');
  if (patch.evidenceType) { if (!EVIDENCE[patch.evidenceType]) throw new Error('Unknown evidence type.'); i.evidenceType = patch.evidenceType; i.retagged = true; }
  if (patch.segmentId !== undefined) { i.segmentId = patch.segmentId || null; i.retagged = true; }
  if (patch.theme) i.theme = String(patch.theme).slice(0, 60);
  if (patch.excluded !== undefined) i.excluded = !!patch.excluded;
  return i;
}
export function mergeThemes(state, from, to) {
  const f = String(from ?? '').trim(); const t = String(to ?? '').trim();
  if (!f || !t || f === t) throw new Error('Pick two different themes to merge.');
  let n = 0;
  for (const i of disc(state).insights) if (i.theme === f) { i.theme = t; n++; }
  if (!n) throw new Error('No insights under that theme.');
  return n;
}
/** Set a whole conversation aside (friends' enthusiasm, a respondent you do not trust). Excluded calls never count as evidence. */
export function excludeInterview(state, ivId, excluded = true, reason = '') {
  const iv = disc(state).interviews.find((x) => x.id === ivId);
  if (!iv) throw new Error('Interview not found.');
  iv.excluded = !!excluded; iv.excludedReason = reason;
  for (const i of disc(state).insights) if (i.interviewId === ivId) i.excluded = !!excluded;
  return iv;
}

// ---------------------------------------------------------------- claims

/** Grade a pattern claim by what it cites, not by how it is worded. */
export function claimQuality(state, claim) {
  const r = disc(state);
  const cited = r.insights.filter((i) => (claim.insightIds ?? []).includes(i.id) && !i.excluded && !i.rehearsal);
  if (!cited.length) return { q: 0, parts: {}, people: 0 };
  enrichInsights(state);
  const people = new Set(cited.map((i) => i.interviewId));
  const behaviourShare = cited.filter((i) => isBehavioural(i.evidenceType) && !i.negative).length / cited.length;
  const seg = claim.segmentId || null;
  const inSeg = seg ? cited.filter((i) => i.segmentId === seg).length / cited.length : 0;
  const closeShare = cited.filter((i) => CLOSE.has(i.relationship)).length / cited.length;
  const strongSegment = seg && inSeg >= 0.8 ? 1 : seg ? inSeg : 0;
  const parts = { segmentSpecific: strongSegment, behaviourBased: behaviourShare, enoughPeople: Math.min(1, people.size / 5), notFriends: 1 - closeShare };
  const q = clamp(0.35 * parts.segmentSpecific + 0.35 * parts.behaviourBased + 0.2 * parts.enoughPeople + 0.1 * parts.notFriends, 0, 1) * (seg ? 1 : 0.55);
  return { q: Math.round(q * 100) / 100, parts, people: people.size };
}

export function addClaim(state, { text, segmentId = null, kind = 'pain', insightIds = [] }) {
  const t = String(text ?? '').trim();
  if (words(t) < 5) throw new Error('Write the pattern as a sentence: who, what they did, how many.');
  const claim = { id: uid('clm'), day: state.day, text: t.slice(0, 400), segmentId: segmentId || null, kind, insightIds: insightIds.slice(0, 40) };
  Object.assign(claim, { grade: claimQuality(state, claim) });
  if (!claim.grade.people) throw new Error('Cite at least one insight in your claim.');
  disc(state).claims.unshift(claim);
  return claim;
}
export function deleteClaim(state, id) { const r = disc(state); r.claims = r.claims.filter((c) => c.id !== id); }

/** Truth-aware accuracy of a claim, known only in a debrief: does the segment it points at really have the problem? */
export function claimAccuracy(state, claim) {
  const t = truthOf(state);
  const seg = t.segments.find((s) => s.id === claim.segmentId);
  if (!seg) return claim.kind === 'weak' ? 0.3 : 0;
  const strength = seg.painPrevalence * seg.intensity;
  const real = seg.id === t.bestSegmentId ? 1 : strength >= 0.3 ? 0.7 : strength >= 0.15 ? 0.3 : 0;
  return claim.kind === 'weak' ? Math.round((1 - real) * 100) / 100 : real;
}

/** 0..1 quality of the player's synthesis (null before any claim). Mean claim grade, shrunk toward 0.4 for few claims. */
export function synthesisQuality(state) {
  const claims = disc(state).claims.filter((c) => c.insightIds?.length);
  if (!claims.length) return null;
  const qs = claims.map((c) => claimQuality(state, c).q);
  const n = qs.length;
  return Math.round(((mean(qs) * n + 0.4 * 2) / (n + 2)) * 100) / 100;
}

/**
 * Hook for product/fit.js evidenceStrength (coordinator wires it): multiply the strength of a feature's linked evidence by
 * this. Good synthesis (segment-specific, behaviour-based claims) lifts it to ~1.2; no synthesis leaves it at 1;
 * linking mostly opinion, friends or single-account asks pulls it to ~0.5. Cap the product at 1.
 */
export function evidenceMultiplier(state, feature, insights = disc(state).insights) {
  const ids = new Set(feature.evidence ?? []);
  const linked = insights.filter((i) => ids.has(i.id));
  if (!linked.length) return 1;
  enrichInsights(state);
  const weak = linked.filter((i) => !isBehavioural(i.evidenceType) || CLOSE.has(i.relationship) || i.negative).length / linked.length;
  const sq = synthesisQuality(state);
  const lift = sq == null ? 0 : (sq - 0.4) * 0.5; // -0.2..+0.3
  return Math.round(clamp(1 - 0.55 * weak + lift, 0.4, 1.25) * 100) / 100;
}

/** Strength of one insight as evidence (for ranking on the board). */
export const insightWeight = (i) => (EVIDENCE[i.evidenceType]?.weight ?? 0.1) * (CLOSE.has(i.relationship) ? 0.4 : 1);
