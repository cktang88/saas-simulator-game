// Operator readers for Product (product_prioritization, ai_building) and the mistakes-ledger adapter.
// Reads come from what the player did: linked real evidence, 30-day metric checks, logged decisions, rebuilds,
// and the AI-coding workflow actually used per build hour (not a toggle), plus outcomes (open bugs, incidents,
// leaks). See public/data/operator-tiers.js and core/operator.js.

import { registerOperatorReader, logMistake, tierFromScore, shrink, unknownRead, tierBehaviours } from '../../core/operator.js';
import { round2 } from '../../core/util.js';
import { evidenceStrength } from './fit.js';
import { hitRate } from './decisions.js';
import { workflowScore, coachingFor, measuredSpeed } from './agent.js';
import { builderScore } from './builder.js';
import { releaseStats } from './releases.js';
import { openBugHours } from './build.js';

const insightsOf = (state) => state.apps.research?.insights ?? [];

// Log a product mistake to the shared ledger and keep a local trace on the slice (shown in Product).
export function productMistake(state, slice, m) {
  const e = logMistake(state, { app: 'product', ...m });
  if (e) {
    slice.mistakes ??= [];
    slice.mistakes.unshift({ day: e.day, label: e.label, detail: e.detail, cost: e.cost, functionId: e.functionId });
    if (slice.mistakes.length > 100) slice.mistakes.length = 100;
  }
  return e;
}

export function readPrioritization(state) {
  const slice = state.apps.product;
  const shipped = (slice?.features ?? []).filter((f) => f.status === 'shipped' || f.status === 'killed');
  if (shipped.length < 2) return unknownRead('Ship at least two features with a written metric to get a read.');
  const ins = insightsOf(state);
  const ev = shipped.reduce((a, f) => a + (f.ship?.evidence ?? evidenceStrength(f, ins)), 0) / shipped.length;
  const hr = hitRate(shipped);
  const decided = (slice.decisions ?? []).filter((d) => ['kill', 'decline', 'iterate', 'keep'].includes(d.kind) && String(d.reason ?? '').trim().length >= 12).length;
  const rebuilds = (slice.decisions ?? []).filter((d) => d.kind === 'rebuild').length;
  const unmeas = hr.all ? hr.unmeasurable / hr.all : 0;
  const raw = 0.4 * ev + 0.3 * (hr.rate ?? ev) + 0.15 * Math.min(1, decided / 2) + 0.15 * (1 - unmeas) - 0.1 * Math.min(2, rebuilds);
  const score = round2(shrink(Math.max(0, raw), shipped.length, 0.5, 3));
  const tier = tierFromScore(score, { cuts: { stellar: 0.72, good: 0.55, average: 0.4 } });
  const evidence = [
    `${shipped.length} shipped; average real-evidence strength ${Math.round(ev * 100)}%`,
    hr.checked ? `${hr.hits}/${hr.checked} checked features hit their metric (${Math.round(hr.rate * 100)}%)` : 'no 30-day metric checks yet',
    `${decided} decision(s) logged with a reason; ${rebuilds} rebuild(s) of killed work`,
  ];
  const coaching = [];
  if (ev < 0.4) coaching.push('Link real interview evidence before you build: unvalidated features risk being unwanted.');
  if (hr.unmeasurable) coaching.push('Write a measurable target and baseline so the 30-day check can tell you whether it worked.');
  if (!decided) coaching.push('Write down what you said no to, and why. Kill features that missed their metric instead of keeping them.');
  if (rebuilds) coaching.push('You rebuilt something you killed. Revisit the evidence before re-queuing old ideas.');
  if (tier !== 'stellar') coaching.push(...tierBehaviours('product_prioritization').slice(0, 1));
  return { tier, score, n: shipped.length, evidence, coaching };
}

export function readAiBuilding(state) {
  const slice = state.apps.product;
  const a = slice?.agent;
  const sessions = a?.sessions ?? [];
  const b = slice?.builder;
  const hours = sessions.reduce((x, s) => x + s.hours, 0);
  if (hours < 4 && !(b?.active && b.tables?.length)) return unknownRead('Run a few build sessions to get a read on how you build with AI.');
  let wf = hours ? sessions.reduce((x, s) => x + s.hours * (s.score ?? 0.5), 0) / hours : 0.5;
  if (b?.active) wf = hours ? (wf + builderScore(b)) / 2 : builderScore(b);
  const bugH = openBugHours(slice);
  const shippedH = slice.features.filter((f) => f.status === 'shipped').reduce((x, f) => x + (f.effortHours ?? 0), 0) || 1;
  const debtRatio = bugH / shippedH;
  const rel = releaseStats(slice.releases ?? { deployments: [], errors: [], incidentMinutes: 0 });
  const leaks = (b?.leaks?.length ?? 0) + (a?.leaks ?? 0) + (a?.wipes ?? 0);
  const outcome = Math.max(0, 1 - debtRatio * 2) * (rel.cfr != null ? Math.max(0, 1 - rel.cfr * 2) : 1) * (leaks ? 0.6 : 1);
  const score = round2(shrink(0.7 * wf + 0.3 * outcome, Math.max(1, hours / 6), 0.5, 2));
  const tier = tierFromScore(score, { cuts: { stellar: 0.78, good: 0.6, average: 0.42 } });
  const m = measuredSpeed(sessions, { day: state.day });
  const evidence = [
    `${round2(hours)} founder build hours; workflow quality ${Math.round(wf * 100)}%`,
    `open bug hours ${Math.round(bugH)} vs ${Math.round(shippedH)} shipped hours`,
    rel.deploys ? `change-failure rate ${Math.round((rel.cfr ?? 0) * 100)}% over ${rel.deploys} deploys` : 'no deploys yet',
    m ? `measured net speed ${m.net}× (${m.lo}–${m.hi}×)` : '',
    leaks ? `${leaks} security / destructive event(s)` : '',
  ].filter(Boolean);
  const coaching = [...coachingFor(a?.workflow ?? {}).slice(0, 3)];
  if (b?.active && !b.reviewed) coaching.push('Get one senior engineer to review the generated backend before you charge users: the built-in scan does not test whether a policy really blocks access.');
  return { tier, score, n: sessions.length, evidence, coaching };
}

registerOperatorReader('product_prioritization', readPrioritization);
registerOperatorReader('ai_building', readAiBuilding);

