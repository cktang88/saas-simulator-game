// Lazily created state slices for Product, Customer panel and Research (shared so apps can read each other).

import { ensure } from '../../core/state.js';
import { uid } from '../../core/util.js';
import { DEFAULT_WORKFLOW } from './agent.js';

export const productSlice = (state) => {
  const s = ensure(state, 'product', () => ({ features: [], buildQueue: [], bugs: [], changelog: [], bugShare: 0.2, inferenceAccrued: 0, inferenceMonth: 0 }));
  s.features ??= []; s.buildQueue ??= []; s.bugs ??= []; s.changelog ??= [];
  s.bugShare ??= 0.2; s.inferenceAccrued ??= 0;
  s.agent ??= {}; // AI-coding workflow (product/agent.js); its presence retires People's old aiReview toggle
  const a = s.agent;
  a.workflow = { ...DEFAULT_WORKFLOW, ...(a.workflow ?? {}) };
  a.sessions ??= []; a.usage ??= { month: null, hours: 0, overageUsd: 0 }; a.unreviewedDebt ??= 0; a.leaks ??= 0; a.wipes ??= 0;
  s.effects ??= []; s.decisions ??= []; s.events ??= [];
  return s;
};

export const customersSlice = (state) => {
  const s = ensure(state, 'customers', () => ({ panels: [], feedback: [], surveys: [], onboarding: [], seenSubs: [] }));
  s.panels ??= []; s.feedback ??= []; s.surveys ??= []; s.onboarding ??= []; s.seenSubs ??= [];
  return s;
};

export const researchSlice = (state) => {
  const s = ensure(state, 'research', () => ({ interviews: [], insights: [], introCredits: 0 }));
  s.interviews ??= []; s.insights ??= []; s.introCredits ??= 0;
  return s;
};

export function newFeature(state) {
  return {
    id: uid('feat'), title: '', user: '', problem: '', solution: '', acceptance: [], acceptanceText: '',
    metric: '', baseline: '', nonGoals: '', evidence: [], ai: { enabled: false, level: 'light' },
    spec: '', status: 'draft', effortHours: null, agentHours: null, progressHours: 0,
    grade: null, gradeKey: null, createdDay: state.day, shippedDay: null,
  };
}
