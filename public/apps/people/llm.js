// LLM work for the People app: job-post review, live interview chat, and candidate email replies.
// Every call has a deterministic fallback with the same shape.

import { REALISM } from '../../core/llm.js';
import { addMessage, findThread, ensureMail } from '../../core/mail.js';
import { clamp, round2 } from '../../core/util.js';
import { ROLES, REGIONS } from './catalog.js';
import { heuristicPostJudge, POST_SCHEMA, INTERVIEW_SCHEMA, CANDIDATE_MAIL_SCHEMA, heuristicCandidateReply, candidatePersonaPrompt } from './hiring.js';
import { ensurePeople, findCand, findJob } from './sim.js';

export async function judgeJobPost(ctx, job) {
  const s = ctx.state;
  const res = await ctx.llm.panel({
    task: 'job_post_review',
    system: `${REALISM}\nYou are a strong, employed ${ROLES[job.role].label} in ${REGIONS[job.region].label} skimming job posts in 2026. You get recruiter spam daily and apply to almost nothing. You only apply when a post is specific about what you would own, how success is measured, the stage of the company and the pay.`,
    prompt: `Job post from ${s.company.name} (${s.company.oneLiner || 'early-stage SaaS'}). Engagement: ${job.engagement}. Pay range entered: ${job.payLo ? `${job.payLo}–${job.payHi}` : 'none'}.\n\n=== POST ===\n${String(job.text).slice(0, 6000)}\n=== END ===`,
    schema: POST_SCHEMA,
    temperature: 0.6,
    fallback: () => heuristicPostJudge(job),
    cache: s.cache,
  });
  const n = res.length || 1;
  const avg = (k) => res.reduce((a, r) => a + (Number(r.data?.[k]) || 0), 0) / n;
  const first = res[0]?.data ?? heuristicPostJudge(job);
  return {
    firstImpression: first.firstImpression, clarity: round2(clamp(avg('clarity'), 1, 10)), specificity: round2(clamp(avg('specificity'), 1, 10)),
    payTransparency: res.some((r) => r.data?.payTransparency) || Boolean(job.payLo && job.payHi),
    issues: [...new Set(res.flatMap((r) => r.data?.issues ?? []))].slice(0, 6), rewriteHint: first.rewriteHint,
    mock: res.every((r) => r.mock), models: res.map((r) => r.model),
  };
}

// One interview turn. Mutates the candidate's transcript.
export async function interviewTurn(ctx, candId, question) {
  const s = ctx.state;
  const p = ensurePeople(s);
  const c = findCand(p, candId);
  const job = findJob(p, c.jobId);
  c.interview.messages.push({ from: 'me', text: question });
  const transcript = c.interview.messages.slice(-12).map((m) => `${m.from === 'me' ? 'Founder' : c.name}: ${m.text}`).join('\n');
  const res = await ctx.llm.ask({
    task: 'candidate_interview',
    system: candidatePersonaPrompt(s, c, job),
    prompt: `Live video interview transcript so far:\n${transcript}\n\nReply to the founder's last message as ${c.name}.`,
    schema: INTERVIEW_SCHEMA,
    temperature: 0.8,
    maxTokens: 400,
    fallback: () => heuristicCandidateReply(c, question),
  });
  c.interview.messages.push({ from: 'them', text: String(res.data.reply ?? '').slice(0, 1500), interest: clamp(Number(res.data.interest) || 5, 0, 10), mock: res.mock });
  return res;
}

function heuristicMailReply(c, body) {
  const t = body.toLowerCase();
  let sentiment = 0, reply;
  if (/runway|revenue|customers|mrr|funded|raised/.test(t)) sentiment += 0.04;
  if (/equity|options|vest/.test(t)) sentiment += c.persona.concern === 'equity upside' ? 0.06 : 0.02;
  if (/(increase|raise|bump|improve).*(offer|salary|base|rate)|(offer|salary|base|rate).*(increase|raise|bump)/.test(t)) sentiment += 0.08;
  if (/asap|deadline|exploding|today only|need an answer/.test(t)) sentiment -= 0.06;
  if (body.length < 40) sentiment -= 0.02;
  if (c.stage === 'offer') reply = sentiment > 0.05 ? 'Thanks, that helps a lot. Give me a couple of days to decide.' : sentiment < 0 ? 'I understand, but I won\'t be rushed on a decision like this.' : 'Thanks for the note. Still thinking it over; I\'ll get back to you soon.';
  else if (c.stage === 'hired') reply = 'Thanks! Anything I should read or set up before day one?';
  else reply = 'Thanks for reaching out. What would the next step be?';
  return { reply, sentiment: round2(clamp(sentiment, -0.3, 0.3)) };
}

// Job handler: the player replied to a candidate in Mail.
export async function replyCandidate(ctx, { threadId, refId }) {
  const s = ctx.state;
  const p = ensurePeople(s);
  const c = findCand(p, refId);
  const t = ensureMail(s).threads.find((x) => x.id === threadId) ?? findThread(s, refId);
  if (!c || !t) return;
  const last = t.messages.filter((m) => m.from === 'me').at(-1)?.body ?? '';
  const job = findJob(p, c.jobId);
  const history = t.messages.slice(-8).map((m) => `${m.from === 'me' ? 'Founder' : c.name}: ${m.body}`).join('\n\n');
  const res = await ctx.llm.ask({
    task: 'candidate_email',
    system: `${candidatePersonaPrompt(s, c, job)}\nYou are now emailing. Current status: ${c.stage === 'offer' ? `you have a written offer and haven't decided yet (you expected ${c.expectation})` : c.stage}. ${REALISM}`,
    prompt: `Email thread:\n${history}\n\nWrite your reply to the founder's latest email. Also rate how it changed your willingness to accept (-1..1).`,
    schema: CANDIDATE_MAIL_SCHEMA,
    temperature: 0.7,
    maxTokens: 400,
    fallback: () => heuristicMailReply(c, last),
  });
  const sentiment = clamp(Number(res.data.sentiment) || 0, -1, 1);
  if (c.stage === 'offer') c.offerSentiment = round2(clamp((c.offerSentiment ?? 0) + sentiment * 0.15, -0.2, 0.2));
  addMessage(s, t.id, { from: 'them', body: String(res.data.reply ?? '').slice(0, 2000), meta: { mock: res.mock } });
}
