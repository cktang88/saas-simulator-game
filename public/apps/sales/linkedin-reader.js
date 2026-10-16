// Operator reader: linkedin_prospecting (core/operator.js, data/operator-tiers.js). Reads what the player DID on
// LinkedIn against the hidden truth of the people they reached: were they buyers in the market and active on LinkedIn
// (targeting precision), did a real intent signal exist (engaged with your post, viewed you, job change, your comment),
// was the note/message specific and true, not a pitch or a template, was automation running, did the account get
// restricted. Outcomes (acceptance, replies) are shrunk toward the median because they are noisy at small n.
// Volume is evidence, never score: sending more of the same behaviour cannot raise the read.
import { registerOperatorReader, tierFromScore, unknownRead, trapCoaching, tierBehaviours, shrink } from '../../core/operator.js';
import { clamp } from '../../core/util.js';
import { liStats } from './linkedin.js';

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function linkedinRead(state) {
  const L = state.apps?.outreach?.linkedin;
  const log = (L?.log ?? []).filter((x) => x.day > state.day - 180 && x.kind !== 'comment');
  if (log.length < 15) return unknownRead('Reach at least 15 people on LinkedIn before your prospecting can be read.');
  const precision = mean(log.map((x) => (x.fit >= 0.55 && x.active ? 1 : x.fit >= 0.55 ? 0.5 : x.fit >= 0.35 ? 0.2 : 0)));
  // Signal strength [design]: engagement with your posts, profile views and job changes are strong; your own comment
  // warm-up and a competitor-post engagement are medium; "posted recently" only shows the person is reachable.
  const W = { commented_your_post: 1, liked_your_post: 0.8, viewed_you: 0.8, job_change: 0.9, you_commented: 0.7, competitor_engager: 0.6, shared: 0.6, posted_recently: 0.35 };
  const signal = mean(log.map((x) => Math.min(1, Math.max(0, ...(x.signals ?? []).map((k) => W[k] ?? 0)) + 0.15 * Math.max(0, (x.signals?.length ?? 0) - 1))));
  const craft = mean(log.map((x) => x.q ?? 0.45));
  const pitch = mean(log.map((x) => (x.pitch ? 1 : 0)));
  const template = mean(log.map((x) => (x.template ? 1 : 0)));
  const fake = mean(log.map((x) => (x.falseClaim || x.creepy ? 1 : 0)));
  const auto = mean(log.map((x) => (x.auto ? 1 : 0)));
  const junk = mean(log.map((x) => (x.engagerKind && x.engagerKind !== 'icp' ? 1 : 0)));
  const st = liStats(state, 180);
  const acc = shrink(st.acceptance ?? 0.28, st.decided, 0.28, 10);
  const reply = shrink(st.replyRate ?? 0.1, st.answered, 0.1, 10);
  const restrictions = L?.health?.events?.length ?? 0;
  const comments = (L?.log ?? []).filter((x) => x.kind === 'comment' && x.day > state.day - 180);
  const goodComments = comments.filter((x) => (x.q ?? 0) >= 0.6).length;
  const score = clamp(
    0.2 * precision + 0.17 * signal + 0.2 * craft + 0.12 * clamp((acc - 0.1) / 0.4, 0, 1) + 0.11 * clamp(reply / 0.3, 0, 1)
    + 0.1 * (1 - auto) + 0.1 * Math.min(1, goodComments / 10)
    - 0.15 * pitch - 0.1 * template - 0.12 * fake - 0.1 * junk - 0.08 * Math.min(2, restrictions), 0, 1);
  const evidence = [
    `${log.length} people reached; ${Math.round(precision * 100)}% targeting precision (buyers in your market who use LinkedIn)`,
    `${Math.round(signal * 100)}% of touches had an intent signal; message craft ${Math.round(craft * 100)}/100`,
    `acceptance ${st.acceptance == null ? 'n/a' : `${Math.round(st.acceptance * 100)}%`} of ${st.decided}, replies ${st.replyRate == null ? 'n/a' : `${Math.round(st.replyRate * 100)}%`} of ${st.answered} messages, ${st.positive} positive`,
  ];
  if (pitch > 0.1) evidence.push(`${Math.round(pitch * 100)}% of touches pitched`);
  if (template > 0.2) evidence.push(`${Math.round(template * 100)}% were the same template`);
  if (auto > 0.2) evidence.push(`${Math.round(auto * 100)}% sent by an automation tool`);
  if (restrictions) evidence.push(`${restrictions} restriction event(s)`);
  const coaching = [];
  if (pitch > 0.1) coaching.push(trapCoaching('linkedin_prospecting', 'pitch_in_connection_note'));
  if (junk > 0.15) coaching.push(trapCoaching('linkedin_prospecting', 'mass_dm_likers'));
  if (auto > 0.2 || restrictions) coaching.push(trapCoaching('linkedin_prospecting', 'li_restricted'));
  if (template > 0.2 || fake > 0.05) coaching.push(trapCoaching('linkedin_prospecting', 'li_template_blast'));
  if (signal < 0.3) coaching.push(trapCoaching('linkedin_prospecting', 'ignored_warm_engagers'));
  const tier = tierFromScore(score, { cuts: { stellar: 0.75, good: 0.55, average: 0.33 } }); // [design] cuts for this score's scale
  if (tier !== 'stellar') coaching.push(`What a stellar operator does: ${tierBehaviours('linkedin_prospecting', 'stellar')[0]}`);
  return { tier, score: +score.toFixed(2), n: log.length, evidence, coaching: coaching.filter(Boolean) };
}

registerOperatorReader('linkedin_prospecting', linkedinRead);
