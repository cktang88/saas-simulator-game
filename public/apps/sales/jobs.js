// Async LLM work for the sales apps. Statistics decide WHETHER something happens (calibrated to research);
// the LLM persona, grounded in the prospect's real website and title, decides HOW it is said.
import { REALISM } from '../../core/llm.js';
import { newThread, addMessage, findThread, ensureMail } from '../../core/mail.js';
import { notify } from '../../core/state.js';
import { chance, rng, clamp } from '../../core/util.js';
import { SALES } from './params.js';
import { hasProduct, shippedFeatures, mainPlan, monthlyPrice } from '../../core/market.js';
import { prospectSystemPrompt, validateReply } from '../../data/persona-prompts.js';
import { analyzeCopy, specificity, renderTemplate, varsFor, asksForMeeting, replyQuality } from './copy.js';
import { personaFor, siteExcerpt, fallbackColdReply, fallbackThreadReply, meetingProbability, isPositive } from './replies.js';
import { ensureCrm, ensureOutreach, contactById, companyOf, contactName, createMeeting, nextSlot, slotText, openMeetingFor, loseDeal, addActivity, openDealFor, companyById } from './model.js';
import { stepKey } from './engine.js';
import { markFounderAnswered } from './inbox.js';
import { rubricText, weighted } from '../../core/rubric.js';
import { rubricSchema, cleanRubric } from '../../core/rubric-schema.js';
import { COLD_EMAIL_RUBRIC, THREAD_PERSONA } from './rubrics.js';

const priceText = (state) => state.plans.filter((p) => p.active).map((p) => `${p.name} $${p.price}/${p.interval}`).join(', ');
const shippedText = (state) => shippedFeatures(state).map((f) => `- ${f.title}${f.problem ? `: ${String(f.problem).slice(0, 120)}` : ''}`).join('\n') || '(nothing shipped yet: the product does not exist)';

// The hidden person (pain, authority, WTP, idiosyncratic ask) comes from the market truth; the generic prospect prompt and
// the reply validator (data/persona-prompts.js) keep the model inside those facts. Output stays the caller's own JSON schema.
const mainMonthly = (state) => { try { const pl = mainPlan(state); return pl ? monthlyPrice(pl) : null; } catch { return null; } };
function truthPersonaSystem(state, company, persona) {
  const person = { ...persona.person, name: persona.name, role: persona.title };
  const base = prospectSystemPrompt(person, {
    channel: 'email', company: { name: persona.company }, siteExcerpt: siteExcerpt(company, 2200), competitionBrief: persona.competitionBrief,
    seller: { name: state.founder.name, company: state.company.name }, product: { oneLiner: state.company.oneLiner }, price: mainMonthly(state), shipped: shippedText(state),
  });
  const head = base.split('Return ONLY JSON')[0].trimEnd();
  return `${head}
More about your situation (reveal only when asked well):
- Current solution: ${persona.currentTools}. Timeline: ${persona.timeline}. Main worry: ${persona.objection}.
- Budget stance: ${persona.budgetStance}. Never state an exact figure. Only after the seller has asked at least three good questions about your situation (and you really have the pain) may you give a rough range, about $${persona.budgetRange[0]}-${persona.budgetRange[1]}/month. Early budget questions get deflected.
- Authority: ${persona.authority}. Buying process: ${persona.decisionProcess}.
Write like a busy real person: short, plain, no pleasantries, typos are fine. Never invent product capabilities. Reply in plain prose (the JSON shape you are asked for below is the only format).`;
}

/** Clamp a model reply to what the hidden person can honestly say (no leaked WTP, no invented commitments). Returns the cleaned text. */
export function cleanProspectText(state, persona, text, { question = '', history = [] } = {}) {
  if (!persona?.person || !text) return text;
  const person = { ...persona.person, name: persona.name, role: persona.title };
  const hist = history.map((m) => ({ from: m.from === 'me' ? 'me' : 'them', text: m.body ?? m.text ?? '' }));
  return validateReply(person, { reply: text, revealed: [], commitment: 'none', statedWtp: null, sentiment: 'neutral' }, hist, { question, price: mainMonthly(state) }).reply || text;
}

export function personaSystem(state, contact, company, persona) {
  if (persona?.person) return truthPersonaSystem(state, company, persona);
  return `${REALISM}
You are ${persona.name}, ${persona.title} at ${persona.company}. The year is 2026.
What your company's own website says (this is who you are; stay consistent with it):
${siteExcerpt(company, 2200)}
Hidden facts about you (reveal only when asked well, never list them):
- Real pain in this area: ${persona.pain}. Recent incident: ${persona.lastIncident}.
- Current solution: ${persona.currentTools}. Timeline: ${persona.timeline}.
- Budget stance: ${persona.budgetStance}. Never state an exact figure. Only after the seller has asked at least three good questions about your situation (and you really have the pain) may you give a rough range, about $${persona.budgetRange[0]}–${persona.budgetRange[1]}/month. Early budget questions get deflected.
- Authority: ${persona.authority}. Buying process: ${persona.decisionProcess}. Main worry: ${persona.objection}.
- ${persona.competitionBrief ? `Competitive context: ${persona.competitionBrief} Bring these up naturally when relevant ("we already use X", "how are you different from Y?"). Only mention tools listed here.` : 'You do not know other tools in this space by name; do not invent any.'}
The seller is ${state.founder.name} from ${state.company.name} ("${state.company.oneLiner || 'no description'}"). Price: ${priceText(state)}.
What is actually shipped and usable today:
${shippedText(state)}
Write like a busy real person: short, plain, no pleasantries, typos are fine. Never invent product capabilities.`;
}

const REPLY_SCHEMA = { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply: { type: 'string' } } };

const KIND_BRIEF = {
  interested: 'You are genuinely interested: reply positively, mention your actual situation, maybe ask one practical question (price, setup, how it works).',
  curious: 'You are mildly curious but skeptical: ask one pointed question. Do not agree to a call yet.',
  objection: 'You are not convinced: reply with your real objection in one or two sentences.',
  not_now: 'Not a priority now: say so briefly, maybe suggest checking back later.',
  unsubscribe: 'You are annoyed or it is irrelevant: ask to be removed. One sentence.',
  hallucination: 'The email claimed something false about your company (an AI SDR hallucinated). Point it out, irritated, and ask to be removed.',
};

/** Job: a prospect replies to a cold email / LinkedIn message (kind already decided by the gate). */
export async function coldReplyJob(ctx, p) {
  const s = ctx.state;
  const contact = contactById(s, p.contactId);
  if (!contact) return;
  const company = companyOf(s, contact) ?? {};
  const persona = personaFor(s, contact, company);
  const sender = s.founder.name.split(' ')[0];
  let text;
  let mock = true;
  if (p.kind === 'ooo') text = fallbackColdReply('ooo', { persona, company, sender });
  else {
    const res = await ctx.llm.ask({
      task: 'cold_email_reply',
      system: personaSystem(s, contact, company, persona),
      prompt: `You received this ${p.channel === 'linkedin' ? 'LinkedIn message' : 'cold email'}:\nSubject: ${p.subject}\n\n${p.body}\n\nYour reaction is already decided: ${KIND_BRIEF[p.kind] ?? KIND_BRIEF.curious}\nWrite only your reply (under 70 words), in character. Return JSON {"reply": "..."}.`,
      schema: REPLY_SCHEMA, temperature: 0.9, maxTokens: 300,
      fallback: () => ({ reply: fallbackColdReply(p.kind, { persona, company, sender, seed: contact.email }) }),
    });
    text = String(res.data?.reply ?? '').trim() || fallbackColdReply(p.kind, { persona, company, sender, seed: contact.email });
    if (!res.mock) text = cleanProspectText(s, persona, text, { question: p.body });
    mock = res.mock;
  }
  let thread = (contact.threadId && ensureMail(s).threads.find((t) => t.id === contact.threadId)) || findThread(s, contact.id);
  if (!thread) {
    thread = newThread(s, { subject: p.subject.startsWith('Re:') ? p.subject : `Re: ${p.subject}`, with: { name: contactName(contact), email: contact.email }, kind: 'prospect', app: 'crm', refId: contact.id });
    const mine = addMessage(s, thread.id, { from: 'me', body: p.body, meta: { channel: p.channel, source: p.source } });
    mine.day = p.day;
  }
  contact.threadId = thread.id;
  const m = addMessage(s, thread.id, { from: 'them', body: text, meta: { kind: p.kind, channel: p.channel, mock } });
  m.day = p.day;
  thread.lastDay = Math.max(thread.lastDay, p.day);
  if (p.kind !== 'ooo') {
    const label = { interested: 'interested', curious: 'curious', objection: 'objection', not_now: 'not now', unsubscribe: 'unsubscribe', hallucination: 'angry (AI SDR error)' }[p.kind];
    notify(s, `${contactName(contact)}${company.name ? ` (${company.name})` : ''} replied: ${label}.${isPositive(p.kind) ? ' Answer fast: replies within 24h win more.' : ''}`, { type: isPositive(p.kind) ? 'good' : 'info', app: 'mail' });
  }
}

const THREAD_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'agreesToMeeting', 'unsubscribe', 'interest'],
  properties: {
    reply: { type: 'string' },
    agreesToMeeting: { type: 'boolean' },
    unsubscribe: { type: 'boolean' },
    interest: { type: 'number', description: '0-10 how interested you are now' },
  },
};

const GHOST = { interested: 0.08, curious: 0.25, objection: 0.5, not_now: 0.65, unsubscribe: 0.8, inbound: 0.05, hallucination: 0.9 };

/** Job `reply:prospect`: the founder answered in Mail; the prospect answers in character (or ghosts). */
export async function prospectReplyJob(ctx, { threadId, refId }) {
  const s = ctx.state;
  const thread = ensureMail(s).threads.find((t) => t.id === threadId);
  const contact = contactById(s, refId);
  if (!thread || !contact) return;
  const company = companyOf(s, contact) ?? {};
  const persona = personaFor(s, contact, company);
  const mine = [...thread.messages].reverse().find((m) => m.from === 'me');
  if (!mine) return;
  const delay = contact.lastThemDay != null ? Math.max(0, mine.day - contact.lastThemDay) : 0;
  (contact.responseDelays ??= []).push(delay);
  if (contact.responseDelays.length > 20) contact.responseDelays.shift();
  const kind = contact.replyKind ?? (contact.warm ? 'inbound' : 'curious');
  const asked = asksForMeeting(mine.body);
  const already = openMeetingFor(s, contact.id);
  const priorAsks = contact.unansweredAsks ?? 0;
  addActivity(s, { type: 'email', text: `You replied${delay <= 1 ? ' (within 24h)' : ` (${delay} days later)`}`, companyId: company.id, contactId: contact.id });
  const deal = openDealFor(s, company.id);
  if (deal) deal.lastTouchDay = s.day;
  markFounderAnswered(s, contact.id); // the reply inbox item is handled by you
  const R = SALES.repeatAsk;
  // Pushing for a meeting after unanswered asks drives opt-outs (from the 3rd ask).
  if (asked && !already && priorAsks + 1 >= R.unsubFrom && chance(s, R.unsubChance)) {
    contact.status = 'unsubscribed';
    contact.replyKind = 'unsubscribe';
    addMessage(s, thread.id, { from: 'them', body: 'Please stop emailing me about this.', meta: { mock: true } });
    loseDeal(s, openDealFor(s, company.id), 'Asked to stop (too many meeting asks)');
    return;
  }
  // Ghosting is sticky: a prospect who went quiet stays quiet for a couple of weeks.
  const ghosted = contact.ghostUntil != null && s.day < contact.ghostUntil;
  if (contact.status === 'unsubscribed' || ghosted || chance(s, clamp((GHOST[kind] ?? 0.3) * (delay > 3 ? 1.5 : 1), 0, 0.95))) {
    if (!ghosted && contact.status !== 'unsubscribed') contact.ghostUntil = s.day + R.ghostDays;
    if (asked && !already) contact.unansweredAsks = priorAsks + 1;
    addActivity(s, { type: 'note', text: 'No response to your last email (yet).', companyId: company.id, contactId: contact.id });
    return;
  }
  const pMeet = already ? 0 : meetingProbability({ kind, asked, delayDays: delay, quality: replyQuality(mine.body), hasProduct: hasProduct(s), priorAsks });
  const willMeet = asked && chance(s, pMeet);
  if (asked && !already && !willMeet) contact.unansweredAsks = priorAsks + 1;
  const slot = willMeet ? nextSlot(s, { minLead: 1 + Math.floor(rng(s) * 4), duration: s.company.model === 'ent' ? 45 : 30, seed: contact.id }) : null;
  const slotStr = slot ? slotText(s, slot) : '';
  const history = thread.messages.slice(-8).map((m) => `${m.from === 'me' ? s.founder.name : persona.name}: ${m.body}`).join('\n---\n');
  const decision = already
    ? `You already have a call booked; answer briefly.`
    : slot ? `If they asked for a call, you WILL accept this exact slot: ${slotStr}. Confirm it in your reply (set agreesToMeeting=true). You may decline only if their last message was rude, pushy or irrelevant.`
      : `You will NOT agree to a call or meeting in this reply (agreesToMeeting=false). Answer what they asked, in character, or push back.`;
  const res = await ctx.llm.ask({
    task: 'prospect_thread_reply',
    system: `${personaSystem(s, contact, company, persona)}\n${THREAD_PERSONA}`,
    prompt: `Email thread so far (oldest first):\n${history}\n\nYour current stance: ${KIND_BRIEF[kind] ?? 'You reached out to them first (inbound) and want to see if this solves your problem.'}\n${decision}\nIf they ask you to unsubscribe-worthy things or keep pushing after you said no, set unsubscribe=true. Reply in under 90 words. JSON only.`,
    schema: THREAD_SCHEMA, temperature: 0.8, maxTokens: 350,
    fallback: () => ({ reply: fallbackThreadReply({ kind, persona, meeting: Boolean(slot), slotText: slotStr, asked, founderText: mine.body }), agreesToMeeting: Boolean(slot), unsubscribe: kind === 'unsubscribe', interest: slot ? 7 : isPositive(kind) ? 5 : 2 }),
  });
  const d = res.data ?? {};
  let reply = String(d.reply ?? '').trim() || fallbackThreadReply({ kind, persona, meeting: Boolean(slot), slotText: slotStr, asked, founderText: mine.body });
  if (!res.mock) reply = cleanProspectText(s, persona, reply, { question: mine.body, history: thread.messages.slice(-8) });
  addMessage(s, thread.id, { from: 'them', body: reply, meta: { mock: res.mock } });
  contact.lastThemDay = s.day;
  if (typeof d.interest === 'number') {
    if (d.interest >= 7 && kind === 'curious') contact.replyKind = 'interested';
    if (d.interest <= 2 && isPositive(kind)) contact.replyKind = 'not_now';
  }
  if (d.unsubscribe) {
    contact.status = 'unsubscribed';
    contact.replyKind = 'unsubscribe';
    loseDeal(s, openDealFor(s, company.id), 'Asked to stop');
    return;
  }
  if (slot && d.agreesToMeeting !== false) {
    contact.unansweredAsks = 0;
    const src = contact.source === 'ai_sdr' ? 'ai_sdr' : kind === 'inbound' ? 'inbound' : 'outbound';
    createMeeting(s, { contactId: contact.id, slot, source: src, duration: s.company.model === 'ent' ? 45 : 30 });
    notify(s, `${contactName(contact)} booked a call: ${slotStr}. It's on your calendar.`, { type: 'good', app: 'calls' });
  }
}

// ---- Copy judging (LLM panel on a SAMPLE per sequence step) ----

export const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['rubric', 'replyLikelihood', 'relevance', 'specificity', 'clarity', 'spamminess', 'verdict', 'fixes'],
  properties: {
    rubric: rubricSchema(COLD_EMAIL_RUBRIC),
    replyLikelihood: { type: 'number', description: '0-1 probability you would reply at all (realistic: most cold emails get none)' },
    relevance: { type: 'number', description: '1-10' },
    specificity: { type: 'number', description: '1-10: does it reference something specific and true about you?' },
    clarity: { type: 'number', description: '1-10: one clear, easy ask?' },
    spamminess: { type: 'number', description: '1-10: how much it smells like AI-written mass outreach' },
    verdict: { type: 'string' },
    fixes: { type: 'array', items: { type: 'string' } },
  },
};

export function heuristicJudge(email, stepIndex, contact, company) {
  const a = analyzeCopy(email, stepIndex);
  const spec = specificity(contact?.personalization, company);
  const spec10 = clamp(Math.round(2 + (a.usesPersonalization ? spec * 8 : 0)), 1, 10);
  const qmarks = ((email.body ?? '').match(/\?/g) ?? []).length;
  const rubric = cleanRubric({
    relevance: 1 + a.score * 2 + spec * 2,
    specificity: a.usesPersonalization ? 1 + spec * 4 : 1,
    single_ask: !a.asks ? 1 : qmarks > 2 ? 2 : a.hardCta ? 3 : a.words <= 100 ? 5 : 4,
    brevity_plain: (a.words > 150 ? 1 : a.words > 100 ? 3 : a.words >= 30 ? 5 : 3) - (a.buzz.length > 1 ? 1 : 0),
    credibility: 4 - a.slop.length * 1.5 - a.buzz.length * 0.7 - a.spam.length * 1.5 + (/\d/.test(email.body ?? '') ? 1 : 0),
  }, COLD_EMAIL_RUBRIC);
  return {
    rubric,
    replyLikelihood: +clamp(0.005 + a.score * 0.03 + spec * 0.04, 0, 0.2).toFixed(3),
    relevance: clamp(Math.round(3 + a.score * 4 + spec * 2), 1, 10),
    specificity: spec10,
    clarity: clamp(Math.round(2 + (a.asks ? 4 : 0) + (a.words <= 80 ? 3 : 1) - (a.hardCta ? 1 : 0)), 1, 10),
    spamminess: clamp(Math.round(2 + a.slop.length * 2 + a.buzz.length + a.spam.length * 2 + (a.links ? 1 : 0)), 1, 10),
    verdict: a.issues[0] ?? 'Short and plain. Whether I reply depends on whether it is about my actual problem.',
    fixes: a.issues.slice(0, 4),
  };
}

const legacyQuality = (j) => clamp(0.35 * ((j.relevance + j.specificity + j.clarity) / 30) + 0.4 * clamp(j.replyLikelihood / 0.12, 0, 1) + 0.25 * (1 - (j.spamminess - 1) / 9), 0, 1);
/** Rubric (fixed weights) when present, blended with the model's holistic fields. */
export const judgeToQuality = (j) => {
  const old = legacyQuality(j);
  const w = j.rubric ? weighted(j.rubric, COLD_EMAIL_RUBRIC) : null;
  return w == null ? old : clamp(0.5 * old + 0.5 * ((w - 1) / 4), 0, 1);
};

/** Job: judge each step of a sequence on a sample of up to 2 enrolled prospects (cached by copy + recipient). */
export async function judgeSequenceJob(ctx, { sequenceId }) {
  const s = ctx.state;
  const o = ensureOutreach(s);
  const seq = o.sequences.find((x) => x.id === sequenceId);
  if (!seq) return;
  const crm = ensureCrm(s);
  const enrolledIds = o.enrollments.filter((e) => e.sequenceId === seq.id).map((e) => e.contactId);
  let sample = crm.contacts.filter((c) => enrolledIds.includes(c.id)).sort((a, b) => (b.personalization ? 1 : 0) - (a.personalization ? 1 : 0)).slice(0, 2);
  if (!sample.length) sample = [{ firstName: 'Alex', title: 'Owner', email: 'alex@example.com', personalization: '' }];
  seq.judge ??= {};
  for (let i = 0; i < seq.steps.length; i++) {
    const step = seq.steps[i];
    const key = stepKey(step);
    if (seq.judge[key]?.samples >= sample.length && seq.judge[key]?.contacts?.join() === sample.map((c) => c.email).join()) continue;
    const results = [];
    for (const contact of sample) {
      const company = contact.companyId ? companyById(s, contact.companyId) : {};
      const vars = varsFor(s, contact, company);
      const email = { subject: renderTemplate(step.subject || `Re: ${seq.steps[0].subject}`, vars), body: renderTemplate(step.body, vars) };
      const res = await ctx.llm.panel({
        task: 'cold_email_judge', rubric: COLD_EMAIL_RUBRIC,
        system: `${REALISM}\nYou are ${contact.title || 'a decision-maker'} at ${company?.name || 'a small company'}. Your website says:\n${siteExcerpt(company, 1200)}\nYou get 30+ cold emails a week, most AI-written.\n${rubricText(COLD_EMAIL_RUBRIC)}\nPut the rubric scores in "rubric"; quote the exact words behind every score of 2 or lower in "verdict"/"fixes". Emails padded past 100 words, or stuffed with buzzwords or your name/company only, do not earn higher scores.`,
        prompt: `This ${i === 0 ? 'cold email' : `follow-up #${i}`} just arrived:\nSubject: ${email.subject}\n\n${email.body}\n\nScore it as yourself against the rubric. JSON only.`,
        schema: JUDGE_SCHEMA, temperature: 0.6, maxTokens: 400,
        fallback: () => heuristicJudge(email, i, contact, company),
        cache: s.cache,
      });
      results.push(...res.map((r) => ({ ...r.data, mock: r.mock, model: r.model })));
    }
    const live = results.filter((r) => !r.mock);
    const heur = analyzeCopy(step, i).score;
    const llmQ = live.length ? live.reduce((a, r) => a + judgeToQuality(r), 0) / live.length : null;
    seq.judge[key] = {
      quality: +(llmQ == null ? heur : 0.6 * llmQ + 0.4 * heur).toFixed(3),
      mock: !live.length, day: s.day, samples: sample.length, contacts: sample.map((c) => c.email),
      verdicts: results.slice(0, 4).map((r) => ({ model: r.model, mock: r.mock, verdict: r.verdict, fixes: (r.fixes ?? []).slice(0, 3), replyLikelihood: r.replyLikelihood, spamminess: r.spamminess })),
    };
  }
}

// ---- Company research (called from the CRM inside ctx.act) ----

export const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'industry', 'size', 'pains', 'hook', 'fit', 'fitReason'],
  properties: {
    summary: { type: 'string', description: 'What they do, for whom, in 1-2 sentences' },
    industry: { type: 'string' },
    size: { type: 'string', description: 'Best guess: solo, 2-10, 11-50, 51-200, 201-1000, 1000+' },
    pains: { type: 'array', items: { type: 'string' }, description: '2-4 specific pain hypotheses relevant to the seller\'s product, grounded in the site' },
    hook: { type: 'string', description: 'One personalization first line referencing something specific and verifiable on their site. No flattery.' },
    fit: { type: 'number', description: '0-1 how well they match the seller\'s ICP' },
    fitReason: { type: 'string' },
  },
};

export function heuristicResearch(state, company) {
  const site = company.site ?? {};
  const text = `${site.title ?? ''} ${site.description ?? ''} ${(site.headings ?? []).join(' ')} ${site.text ?? ''}`.toLowerCase();
  const icpWords = `${state.company.icp} ${state.company.oneLiner}`.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const hits = [...new Set(icpWords.filter((w) => text.includes(w)))];
  const heading = (site.headings ?? []).find((h) => h.length > 12 && h.length < 90) ?? site.description ?? site.title ?? '';
  return {
    summary: site.description || site.title || `${company.name} (${company.domain})`,
    industry: company.industry || '',
    size: company.size || 'unknown',
    pains: [`Manual work around ${state.company.oneLiner ? state.company.oneLiner.split(/ for | to /)[0].toLowerCase() : 'the problem you solve'}`, 'Tools that don\'t talk to each other', 'Owner time spent on admin instead of customers'],
    hook: heading ? `Saw "${heading.slice(0, 80)}" on ${company.domain || 'your site'}.` : '',
    fit: +clamp(0.25 + hits.length * 0.12, 0.1, 0.85).toFixed(2),
    fitReason: hits.length ? `Site mentions ${hits.slice(0, 4).join(', ')}` : 'Little overlap with your ICP keywords on their site',
  };
}

export async function researchCompany(ctx, company) {
  const s = ctx.state;
  if (company.domain && !company.site?.synthetic) { // database-sourced accounts carry the database profile instead
    const r = await fetch('/api/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: company.domain }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Couldn't fetch ${company.domain}: ${j.error ?? r.status}`);
    company.site = { url: j.url, title: j.title, description: j.description, headings: (j.headings ?? []).slice(0, 20), emails: j.emails ?? [], text: String(j.text ?? '').slice(0, 6000), fetchedDay: s.day };
  }
  const res = await ctx.llm.ask({
    task: 'prospect_research',
    system: `You are a sharp founder-led-sales researcher in 2026. Be specific and skeptical; never invent facts not on the page.`,
    prompt: `Seller: ${s.company.name}: ${s.company.oneLiner || '(no one-liner)'}\nSeller ICP: ${s.company.icp || '(not set)'}\nShipped features: ${shippedText(s)}\n\nProspect company: ${company.name} (${company.domain})\nNotes: ${company.notes || '-'}\nTheir website:\n${siteExcerpt(company, 4000)}\n\nReturn JSON.`,
    schema: RESEARCH_SCHEMA, temperature: 0.4, maxTokens: 700,
    fallback: () => heuristicResearch(s, company),
    cache: s.cache,
  });
  const d = res.data;
  const fit = Number(d.fit);
  company.research = { ...d, fit: clamp(Number.isFinite(fit) ? fit : 0.4, 0, 1), mock: res.mock, day: s.day }; // a judged 0 (no fit) stays 0
  company.industry ||= d.industry;
  if (!company.size || company.size === 'unknown') company.size = d.size;
  addActivity(s, { type: 'research', text: `Researched ${company.domain || company.name}: fit ${Math.round(company.research.fit * 100)}%`, companyId: company.id });
  return company.research;
}

export async function draftPersonalization(ctx, contact, company) {
  const s = ctx.state;
  const res = await ctx.llm.ask({
    task: 'draft_personalization',
    system: 'You write one-line cold email openers for a founder. Reference ONE specific, verifiable thing from the prospect\'s site. No flattery, no "I noticed", no "I came across", under 25 words.',
    prompt: `Prospect: ${contactName(contact)}, ${contact.title || 'unknown title'} at ${company.name}.\nSeller: ${s.company.oneLiner}\nTheir website:\n${siteExcerpt(company, 2500)}\nResearch hook: ${company.research?.hook ?? '-'}\nReturn JSON {"reply": "<the line>"}`,
    schema: REPLY_SCHEMA, temperature: 0.7, maxTokens: 120,
    fallback: () => ({ reply: company.research?.hook || heuristicResearch(s, company).hook || '' }),
    cache: s.cache,
  });
  return String(res.data?.reply ?? '').trim();
}

export const SALES_JOBS = {
  'sales:coldReply': coldReplyJob,
  'reply:prospect': prospectReplyJob,
  'sales:judgeSequence': judgeSequenceJob,
};
