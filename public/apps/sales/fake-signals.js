// Fake validation signals: confident opinions about the IDEA from people who do not have the problem themselves
// (investors, advisors, other founders, friends), plus the public noise around a launch (likes, upvotes).
// They are real, flattering and sound like demand, but they say nothing about whether the segment has the pain
// (docs/research/early-stage/misleading-feedback.md: opinion-givers, polite friends, vanity metrics). Using one
// as evidence (tagging it, or citing it in a feature spec) logs opinion_as_validation.
// Numbers are [design].
import { ensureMarket } from '../../core/market.js';
import { drawPerson } from '../../core/truth.js';
import { logMistake } from '../../core/operator.js';
import { hash, uid } from '../../core/util.js';
import { researchSlice, productSlice } from '../product/store.js';

// inbound archetype category -> who is talking
export const OPINION_KINDS = { investor: 'investor', advisor: 'advisor', founder_peer: 'founder', friend: 'friend' };
const DRAW = { investor: { relationship: 'investor' }, advisor: { relationship: 'investor' }, founder: { relationship: 'founder' }, friend: { channel: 'friends' } };

const LINES = {
  investor: ['Big market and the timing is right. I would back a team like this.', 'I see this category getting funded. Love the vision.', 'Great space. Investors will like the TAM story.', 'Strong idea. Just make sure you are going after the big prize.'],
  advisor: ['I have seen this movie before and it works. You are onto something.', 'Everyone in my network needs this. You should go broad.', 'This is clearly a winner. Focus on the enterprise play.', 'Brilliant positioning. I would put it in front of all my contacts.'],
  founder: ['Nice, I would totally use that. We should swap customers once you launch.', 'Love it. This is exactly what founders like us need.', 'Honestly this is a great wedge. Ship it and see.', 'Smart. I have been thinking about the same thing.'],
  friend: ['I love this, you are going to crush it!', 'This is such a good idea, I would 100% use it.', 'Everyone I know needs this. Proud of you!', 'Amazing. Take my money when it is ready.'],
  social: ['"This is exactly what the space needs!"', '"Take my money. When can I buy?"', '"Following. Great idea."', '"Wow, shut up and take my upvote."'],
};
const pickBy = (arr, seed) => arr[parseInt(hash(seed), 36) % arr.length];

export const opinions = (state) => (ensureMarket(state).opinions ??= []);
export const opinionById = (state, id) => opinions(state).find((o) => o.id === id);

/** The line this kind of sender says about the idea (deterministic per inbound). */
export const opinionLine = (kind, seed = '') => pickBy(LINES[kind] ?? LINES.friend, `${kind}:${seed}`);

/** Prompt rule for a person who gives opinions (messages.js appends it to the reply persona). */
export function opinionRule(kind) {
  if (!kind) return '';
  return `\nYou are an opinion-giver (${kind}). State confident views about the IDEA (market size, timing, "I would use it", "you should go broad") but you do NOT have this problem in your own work, you have no budget for it, and you will not name a concrete incident or price. Confidence is not evidence; never claim pain you do not have.`;
}

function push(state, rec) {
  const list = opinions(state);
  list.push(rec);
  if (list.length > 120) list.shift();
  return rec;
}

/** Called when an inbound from an opinion-giving category is delivered: records the signal with its hidden truth. */
export function captureOpinion(state, inb, gen = {}) {
  const kind = OPINION_KINDS[inb?.category];
  if (!kind || opinions(state).some((o) => o.refId === inb.id)) return null;
  const person = drawPerson(state, { segmentId: 'outsider', seedKey: `op:${inb.id}`, ...DRAW[kind] });
  return push(state, {
    id: uid('sig'), kind, source: 'inbound', refId: inb.id, threadId: inb.threadId ?? null, day: state.day,
    who: gen.senderName ?? inb.category, text: opinionLine(kind, inb.id),
    confidence: person.opinion?.confidence ?? 0.75, // how sure they sound; nothing to do with whether the segment hurts
    hasPain: false, tagged: false,
  });
}

/** Public noise: likes on a post, Product Hunt upvotes. Reads launches/events already recorded by other apps. */
export function socialSignalsDay(state) {
  const seen = (ensureMarket(state).socialSeen ??= {});
  const add = (key, kind, text, extra) => { if (seen[key]) return; seen[key] = state.day; push(state, { id: uid('sig'), kind: 'social', platform: kind, source: 'public', refId: key, day: state.day, who: 'the crowd', text, confidence: 0.9, hasPain: false, tagged: false, ...extra }); };
  for (const l of state.apps?.organic?.launches ?? []) {
    if (l.kind === 'product_hunt') add(`ph:${l.day}`, 'product_hunt', `Product Hunt: #${l.rank ?? '?'} with ${state.apps.organic.ph?.upvotes ?? 'many'} upvotes. ${pickBy(LINES.social, `ph${l.day}`)}`, { launchDay: l.day });
  }
  for (const e of state.network?.publicEvents ?? []) {
    if (['viral_post', 'build_in_public_post'].includes(e.type)) add(`ev:${e.type}:${e.day}`, 'social', `${e.type === 'viral_post' ? 'A post took off' : 'Build-in-public post'}: ${120 + (parseInt(hash(`${e.day}`), 36) % 900)} likes. ${pickBy(LINES.social, `ev${e.day}`)}`);
  }
}

const COST = { hours: 1, days: 7 };
function logAsValidation(state, sig, how, extra = '') {
  return logMistake(state, {
    functionId: 'customer_discovery', id: 'opinion_as_validation', label: 'Treated an opinion as validation', app: 'messages', key: `opinion:${sig.id}:${how}`, delayed: how.startsWith('spec'), charge: how === 'tag', cost: COST,
    detail: `${sig.who} (${sig.kind}) said "${sig.text}" and you used it as evidence${extra}. Investors, advisors, other founders, friends and likes are opinions about the idea from people who do not have the problem and will not pay. They cost nothing to say and predict nothing. Count people with the problem who gave a recent incident or paid.`,
  });
}

/** The player counts a signal as validation (tag/log it as evidence). Adds an unverified, non-real insight others can cite. */
export function tagAsValidation(state, sigId) {
  const sig = opinionById(state, sigId);
  if (!sig) throw new Error('Unknown signal.');
  if (sig.tagged) return { ok: false, insightId: sig.insightId };
  sig.tagged = true;
  const ins = { id: uid('ins'), interviewId: null, opinionSignalId: sig.id, theme: 'Opinions', text: `${sig.who}: ${sig.text}`, type: 'opinion', real: false, verified: false, who: sig.who, day: state.day };
  researchSlice(state).insights.unshift(ins);
  sig.insightId = ins.id;
  logAsValidation(state, sig, 'tag');
  return { ok: true, insightId: ins.id };
}

/** Daily: opinions cited as evidence in a feature spec are the same mistake, later (the roadmap now rests on them). */
export function opinionCitationsDay(state) {
  const ins = researchSlice(state).insights.filter((i) => i.opinionSignalId);
  if (!ins.length) return;
  for (const f of productSlice(state).features ?? []) {
    for (const i of ins) {
      if (!(f.evidence ?? []).includes(i.id)) continue;
      const sig = opinionById(state, i.opinionSignalId);
      if (sig) logAsValidation(state, sig, `spec:${f.id}`, ` in the spec for "${f.title || 'a feature'}"`);
    }
  }
}

/** One daily hook for the apps that own the day loop. */
export function fakeSignalsDay(state) {
  socialSignalsDay(state);
  opinionCitationsDay(state);
}
