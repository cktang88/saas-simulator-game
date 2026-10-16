// Messages (iMessage + LinkedIn DMs) and inbound triage. People contact you based on what your
// business is and what you've done publicly (core/network.js). You decide what to engage with:
// some contacts waste your week, some lead to customers, investors, partners or hires.
// You can also text your own network: ask for intros, catch up, get advice.

import { html, mount, on, formData, modal, toast, badge } from '../core/ui.js';
import { ensureNetwork, addPerson, textThreadFor, addText, deliverInbound, resolveInbound, introDecision, archetypes, recordPublicEvent } from '../core/network.js';
import { REALISM } from '../core/llm.js';
import { newThread, addMessage, ensureMail } from '../core/mail.js';
import { scheduleEvent, findSlots, fmtTime, ensureCalendar, completeEvent } from '../core/calendar.js';
import { addInboundLead } from './sales/crm-api.js';
import { fixRepeatAsk, bookedNote } from './meetings/model.js';
import { fmtDate, words, pick, rng, uid, money, hash, dateOf } from '../core/util.js';
import { notify } from '../core/state.js';
import { personName, nameStream, emailSlug } from '../core/names.js';
import { onInboundEngaged, payInboundFee, AI_LABELS } from './assistant/triage.js';
import { bizBlock } from './context.js';
import { offlineInbound, offlineNetworkReply } from '../core/inbound-text.js';
import { hasProduct } from '../core/market.js';
import { captureOpinion, opinionRule, opinionLine, opinions, tagAsValidation, fakeSignalsDay, OPINION_KINDS } from './sales/fake-signals.js';

const drafts = {};

// ---------------------------------------------------------------------------
// Prompts & fallbacks
// ---------------------------------------------------------------------------

export const OUTCOME_GUIDE = {
  waste: 'They will ultimately be useless to the founder: vague ask, wants free advice or to sell something, or just networking for its own sake. Make it plausible and specific, with the subtle red flags below.',
  scam: 'It is a pay-to-play or predatory offer (pay-to-speak conference, "featured" listing fee, fake investor asking for a due-diligence fee, etc.) dressed up as an opportunity. Make it look legitimate; include subtle tells.',
  intro_customer: 'They genuinely know people who match the ICP and could introduce one, but they do not say so in the first message; it reads like a normal note.',
  intro_investor: 'They genuinely know an investor who would take a meeting; the first message is casual and does not lead with that.',
  intro_partner: 'They genuinely could connect the founder with a useful partner.',
  customer_lead: 'They are a genuine potential customer matching the ICP with a real problem; they may be cautious or brief.',
  investor_meeting: 'They are a real investor (or scout) with genuine interest, though noncommittal.',
  press: 'They are a real journalist/podcaster/newsletter writer who will actually feature the company if engaged.',
  hire: 'They are a genuinely strong potential hire or contractor.',
  advice: 'They are experienced and will give genuinely useful advice if engaged.',
};

const GEN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['senderName', 'senderRole', 'senderCompany', 'senderEmail', 'subject', 'message', 'hiddenAgenda'],
  properties: {
    senderName: { type: 'string' }, senderRole: { type: 'string' }, senderCompany: { type: 'string' }, senderEmail: { type: 'string' },
    subject: { type: 'string' }, message: { type: 'string' },
    hiddenAgenda: { type: 'string', description: 'Private: what this person actually wants and will do, for later role-play. Never shown to the founder.' },
  },
};

const REPLY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reply', 'wantsCall', 'outcomeReady'],
  properties: {
    reply: { type: 'string' },
    wantsCall: { type: 'boolean', description: 'True if you are now asking for or agreeing to a call/meeting.' },
    outcomeReady: { type: 'boolean', description: 'True if your real intent has now played out in this exchange (intro offered, sale pitch made, advice given, interest confirmed or fizzled).' },
  },
};

// What a stranger can see about the company: the website, public pricing and what the founder did in public.
// Nothing internal (MRR, customer count, unannounced money): a sender who "knows" it would be inventing it.
const publicStage = (s) => (hasProduct(s) ? 'product is live' : 'pre-launch (no product live yet)');
function eventText(e) {
  const t = e.type.replaceAll('_', ' ');
  if (e.type === 'funding_announced' && e.meta?.amount) return `${t} (${money(e.meta.amount)})`;
  if (e.type === 'press_coverage' && e.meta?.outlet) return `${t} (${e.meta.outlet})`;
  if (e.type === 'hiring_post' && e.meta?.role) return `${t} (${e.meta.role})`;
  if (e.type === 'revenue_milestone_posted' && e.meta?.mrr) return `${t} (${money(e.meta.mrr)} MRR, posted by the founder)`;
  return t;
}
export function companyBrief(s) {
  const pub = [...new Set((s.network?.publicEvents ?? []).filter((e) => s.day - e.day < 30).map(eventText))];
  const plans = (s.plans ?? []).filter((p) => p.active !== false).map((p) => `${p.name} ${money(p.price)}/${p.interval === 'year' ? 'yr' : 'mo'}`).join('; ');
  return `Company: ${s.company.name}${s.company.domain ? ` (${s.company.domain})` : ''}. What it does: ${s.company.oneLiner || 'not stated'}. Who it is for (as the website says): ${s.company.icp || 'not stated'}. Model: ${s.company.model}. Public status: ${publicStage(s)}. Website: ${s.company.website?.title ?? 'none'} ${s.company.website?.description ?? ''}.${plans ? ` Public pricing: ${plans}.` : ''} Founder: ${s.founder.name}. Recent public activity: ${pub.join(', ') || 'none'}.`;
}

// Archetype hints and red flags are written with {{company}} / {{category}} slots.
const fillHint = (s, t) => String(t ?? '').replaceAll('{{company}}', s.company.name)
  .replaceAll('{{category}}', { b2c: 'consumer subscription app', smb: 'small-business SaaS', ent: 'B2B enterprise software' }[s.company.model] ?? 'SaaS');

// Every generated inbound follows these, so a sender only "knows" what that kind of sender could know.
const KNOWLEDGE_RULES = 'What the sender knows: only the website, public pricing and the public activity listed. If this kind of sender usually cites a signal (an MRR post, a funding round, a launch, a hiring post) that is NOT in the public activity, do not invent it: refer to the product or website instead. Never state or guess the company\'s revenue, customer count, growth, cash or funding unless it is in the public activity.';

function fallbackInbound(s, a, inb) {
  // Shared bank, unique in the game (two rng draws, as before); deliverInbound → addPerson claims it.
  const { first, last } = personName(s, { register: false });
  if (a?.id && a.redFlags) return offlineInbound(s, a, inb, { first, last }); // per-archetype voice, outcome-consistent tells
  return legacyFallbackInbound(s, a, inb, first, last);
}

// Category-level message for an archetype the data file does not know (old saves).
function legacyFallbackInbound(s, a, inb, first, last) {
  const name = `${first} ${last}`;
  const co ={ vendor: 'Growthly Agency', spam: 'LeadBoost', recruiter: 'TalentBridge', investor: 'Northbeam Ventures', customer: `${last} & Co`, partner: 'Stackwise', press: 'The Indie Wire', event: 'SaaS Summit Global', advisor: 'Self-employed', founder_peer: 'a stealth startup', acquirer: 'Corp Dev, Atlas Software', candidate: 'Freelance', friend: '', competitor: 'a "consultancy"' }[a.category] ?? 'Unknown';
  const what = s.company.oneLiner || s.company.name;
  const body = {
    vendor: `Hi ${s.founder.name.split(' ')[0]}, saw ${s.company.name} (${what}). We help SaaS founders 3x pipeline with done-for-you outbound. Open to a quick 15 min this week?`,
    spam: `Hey! Loved ${s.company.name}. We can get you 500 qualified leads/month guaranteed. Reply YES for pricing.`,
    recruiter: `Hi ${s.founder.name.split(' ')[0]}, I work with fast-growing startups on hiring. Would love to learn about ${s.company.name}'s plans this year.`,
    investor: `Hi ${s.founder.name.split(' ')[0]}, came across ${s.company.name}. Would love to learn more about what you're building in ${what}. Free for a quick chat?`,
    customer: `Hi, found your site. We're dealing with exactly this problem. Does ${s.company.name} work for a team like ours? What does it cost?`,
    partner: `Hey ${s.founder.name.split(' ')[0]}, our customers keep asking about ${what}. Worth exploring an integration or co-marketing?`,
    press: `Hi ${s.founder.name.split(' ')[0]}, I'm writing about tools in your space. Would you be up for a few questions about ${s.company.name}?`,
    event: `Hi! We'd love to feature ${s.company.name} as a speaker at our summit. Speaker packages start at $1,500.`,
    advisor: `Saw what you're doing with ${s.company.name}. I've scaled two SaaS companies and could help as an advisor for a bit of equity. Coffee?`,
    founder_peer: `Hey! Fellow founder here building nearby. Would love to swap notes and pick your brain on what's working.`,
    acquirer: `Hi ${s.founder.name.split(' ')[0]}, I lead corp dev at a larger software company. We're keeping tabs on ${what}. Open to an exploratory chat?`,
    candidate: `Hi! Big fan of ${s.company.name}. Any chance you're hiring? I'd love to help.`,
    friend: `hey!! how's the startup going?? we should catch up`,
    competitor: `Hi, we're evaluating tools like ${s.company.name}. Can you walk me through how you handle pricing and your roadmap in detail?`,
  }[a.category] ?? `Hi ${s.founder.name}, quick question about ${s.company.name}.`;
  return {
    senderName: name, senderRole: a.label, senderCompany: co, senderEmail: `${emailSlug(first)}@${emailSlug(co) || 'gmail'}.com`,
    subject: a.category === 'friend' ? '' : `${s.company.name}`, message: body, hiddenAgenda: `${a.label}; true outcome: ${inb.outcome}`,
  };
}

function fallbackReply(s, inb, founderMsg) {
  const engaged = inb.engaged;
  const opKind = OPINION_KINDS[inb.category];
  if (opKind && !['scam'].includes(inb.outcome)) return { reply: `${opinionLine(opKind, `${inb.id}:${engaged}`)} ${/call|chat|meet|zoom|time|calendar|book/i.test(founderMsg) ? 'Happy to chat, pick a time.' : 'Keep me posted.'}`, wantsCall: engaged < 1 && /call|chat|meet|zoom|time|calendar|book/i.test(founderMsg), outcomeReady: engaged >= 1 };
  const arch = archetypes().find((x) => x.id === inb.archetypeId);
  if (arch) return offlineNetworkReply(s, inb, arch, founderMsg);
  const asksCall = /call|chat|meet|zoom|time|calendar|book/i.test(founderMsg);
  const good = !['waste', 'scam'].includes(inb.outcome);
  if (inb.outcome === 'scam') return { reply: 'Great! To confirm your spot we just need the participation fee by Friday. I can send the invoice now.', wantsCall: false, outcomeReady: engaged >= 1 };
  if (!good) return { reply: engaged >= 1 ? "Totally get it. Let me know if anything changes!" : 'Happy to explain more on a quick call. What does your week look like?', wantsCall: engaged < 1 && asksCall, outcomeReady: engaged >= 1 };
  return { reply: asksCall ? 'Yes, let\'s do it. Pick any slot that works.' : 'Thanks for the quick reply! Easier to explain live. Up for a 30 min call?', wantsCall: true, outcomeReady: engaged >= 2 };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

async function genInbound(ctx, { inboundId }) {
  const s = ctx.state;
  const n = ensureNetwork(s);
  const inb = n.inbound.find((x) => x.id === inboundId);
  if (!inb || inb.status !== 'pending') return;
  const a = archetypes().find((x) => x.id === inb.archetypeId) ?? { id: inb.archetypeId, label: inb.category, category: inb.category, promptHint: '', redFlags: [] };
  const res = await ctx.llm.ask({
    task: 'network_inbound', context: bizBlock(ctx.state, 'public'),
    system: `You write ONE realistic message that a founder received in late 2026, exactly as it would arrive. Channel: ${inb.channel === 'imessage' ? 'iMessage text (short, casual, no subject; only from someone who has their number)' : inb.channel === 'linkedin' ? 'LinkedIn DM (semi-formal, 2–5 sentences)' : 'email (subject + body)'}. Sender type: ${a.label}. ${fillHint(s, a.promptHint)}\n${a.category === 'friend' ? `The sender personally knows ${s.founder.name} (friend, relative or ex-colleague) and writes as someone who knows them, not as a business or a stranger; they know what the founder told them, not the company's numbers.\n` : ''}The message must reference the founder's actual business and any recent public activity naturally, the way that kind of sender really would (many senders only skimmed the website). Do not use placeholders or template slots.\n${KNOWLEDGE_RULES}\nHIDDEN TRUTH (never state it): ${OUTCOME_GUIDE[inb.outcome] ?? ''} ${inb.outcome === 'waste' || inb.outcome === 'scam' ? `Subtle red flags to weave in: ${(a.redFlags ?? []).map((f) => fillHint(s, f)).join('; ')}` : ''}`,
    prompt: companyBrief(s),
    schema: GEN_SCHEMA,
    temperature: 0.95,
    maxTokens: 600,
    fallback: () => fallbackInbound(s, a, inb),
  });
  deliverInbound(s, inb, res.data);
  captureOpinion(s, inb, res.data); // investors/advisors/peers/friends: confident opinions, no pain of their own
}

async function personReply(ctx, inb, history, founderMsg, { newFee = null } = {}) {
  const s = ctx.state;
  const n = ensureNetwork(s);
  const person = n.people.find((p) => p.id === inb.personId);
  const res = await ctx.llm.ask({
    task: 'network_reply', context: bizBlock(ctx.state, 'public'),
    system: `${REALISM}\nYou are ${person?.name}, ${person?.role} at ${person?.company}. You contacted the founder of ${s.company.name}. Your private agenda: ${person?.persona}. HIDDEN TRUTH about what you'll really do: ${OUTCOME_GUIDE[inb.outcome] ?? ''} Stay consistent with it; reveal it gradually through what you do, not by announcing it.${newFee ? ` In this message you move to your ask: you are sending a separate invoice or payment request for ${money(newFee.amount)} (${newFee.what}); lead into it naturally, never call it a scam or pay-to-play.` : ''} Write like a real person on ${inb.channel === 'email' ? 'email' : inb.channel}; keep it short.${bookedNote(s, inb)}${opinionRule(OPINION_KINDS[inb.category])}`,
    prompt: `${companyBrief(s)}\n\nConversation so far:\n${history.map((m) => `${m.from === 'me' ? `FOUNDER (${s.founder.name})` : `YOU (${person?.name})`}: ${m.body}`).join('\n')}\n\nThe founder just wrote: "${founderMsg}"\nWrite only YOUR next message, as ${person?.name}, to the founder. Never write the founder's side or sign with their name. A one-word or vague reply from the founder gives you nothing new to work with.`,
    schema: REPLY_SCHEMA,
    temperature: 0.8,
    maxTokens: 400,
    fallback: () => fallbackReply(s, inb, founderMsg),
  });
  return fixRepeatAsk(s, inb, res.data);
}

function maybeBookCall(s, inb, person) {
  if (inb.eventId) return null;
  const cal = ensureCalendar(s);
  const slot = findSlots(s, { fromDay: s.day + (cal.bookingLink ? 1 : 2), duration: 30, count: 1 })[0];
  if (!slot) return null;
  const ev = scheduleEvent(s, { title: `Call: ${person.name}`, kind: 'meeting', app: 'meetings', with: { name: person.name, email: person.email }, day: slot.day, start: slot.start, duration: 30, location: 'Video call' });
  ev.refId = ev.id; // the Meetings app runs the call
  ev.inboundId = inb.id;
  inb.eventId = ev.id;
  return ev;
}

async function replyNetwork(ctx, { threadId, refId }) {
  const s = ctx.state;
  const n = ensureNetwork(s);
  const inb = n.inbound.find((x) => x.id === refId);
  const t = ensureMail(s).threads.find((x) => x.id === threadId);
  if (!inb || !t) return;
  const last = t.messages.filter((m) => m.from === 'me').at(-1)?.body ?? '';
  if (words(last) >= 12) inb.engaged++; // one-word replies don't move a relationship forward
  const hadFee = !!inb.feeAsk;
  onInboundEngaged(s, inb);
  const r = await personReply(ctx, inb, t.messages, last, { newFee: !hadFee ? inb.feeAsk : null });
  addMessage(s, t.id, { from: 'them', body: r.reply });
  if (inb.feeAsk && !hadFee) addMessage(s, t.id, { from: 'them', body: `Invoice attached: ${money(inb.feeAsk.amount)} (${inb.feeAsk.what}), due within 5 days to confirm your spot.` });
  const person = n.people.find((p) => p.id === inb.personId);
  if (r.wantsCall) {
    const ev = maybeBookCall(s, inb, person);
    if (ev) addMessage(s, t.id, { from: 'them', body: `(Calendar invite: ${fmtDate(s, ev.day)} ${fmtTime(ev.start)}, 30 min)` });
  }
  if (r.outcomeReady && inb.engaged >= 2 && ['waste', 'scam', 'advice', 'press'].includes(inb.outcome)) resolveInbound(s, inb, { addInboundLead }); // valuable outcomes (leads, intros, investors, hires) need a real call
}

async function replyText(ctx, { threadId }) {
  const s = ctx.state;
  const n = ensureNetwork(s);
  const t = n.threads.find((x) => x.id === threadId);
  if (!t) return;
  const person = n.people.find((p) => p.id === t.personId);
  const last = t.messages.filter((m) => m.from === 'me').at(-1)?.body ?? '';
  const inb = t.inboundId ? n.inbound.find((x) => x.id === t.inboundId) : null;
  if (inb) {
    if (words(last) >= 12) inb.engaged++;
    const hadFee = !!inb.feeAsk;
    onInboundEngaged(s, inb);
    const r = await personReply(ctx, inb, t.messages, last, { newFee: !hadFee ? inb.feeAsk : null });
    addText(s, t.id, 'them', r.reply);
    if (inb.feeAsk && !hadFee) addText(s, t.id, 'them', `here's the invoice: ${money(inb.feeAsk.amount)} for the ${inb.feeAsk.what}, due this week 🙏`);
    if (r.wantsCall) { const ev = maybeBookCall(s, inb, person); if (ev) addText(s, t.id, 'them', `sent you an invite for ${fmtDate(s, ev.day)} ${fmtTime(ev.start)} 👍`); }
    if (r.outcomeReady && inb.engaged >= 2 && ['waste', 'scam', 'advice', 'press'].includes(inb.outcome)) resolveInbound(s, inb, { addInboundLead }); // valuable outcomes (leads, intros, investors, hires) need a real call
    return;
  }
  // Your own contact (friend, ex-colleague...). Intro requests follow the research intro funnel.
  const asksIntro = /intro|introduce|connect me|know anyone|put me in touch|warm/i.test(last);
  const targetKind = /investor|vc|angel|raise|fund/i.test(last) ? 'investor' : /hire|engineer|designer|candidate/i.test(last) ? 'hire' : /partner|integration/i.test(last) ? 'partner' : 'customer';
  const decision = asksIntro ? introDecision(s, person, { message: last, targetKind }) : null;
  const res = await ctx.llm.ask({
    task: 'network_text', context: bizBlock(ctx.state, 'public'),
    system: `${REALISM}\nYou are ${person.name}, the founder's ${person.relation.replace('_', ' ')} (relationship strength ${Math.round(person.strength * 100)}/100). ${person.role ? `You work as ${person.role} at ${person.company}.` : ''} ${person.howTheyCanHelp ? `Who you know / how you could help: ${person.howTheyCanHelp}.` : ''} ${decision ? (decision.made ? 'You WILL make the introduction they asked for, but ask for a short forwardable blurb first if they did not include one.' : 'You will NOT make the introduction (too busy, not a fit, or you do not know anyone suitable). Decline kindly or deflect.') : ''} Reply as a real text message: short, casual, natural.`,
    prompt: `${companyBrief(s)}\n\nRecent texts:\n${t.messages.slice(-8).map((m) => `${m.from === 'me' ? 'Founder' : person.name}: ${m.body}`).join('\n')}`,
    schema: { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply: { type: 'string' } } },
    temperature: 0.85,
    maxTokens: 250,
    fallback: () => ({ reply: decision ? (decision.made ? 'Happy to! Send me a short blurb I can forward and I\'ll make the intro.' : 'Hmm, I don\'t really know anyone right for that, sorry!') : 'haha nice, how\'s it going so far?' }),
  });
  addText(s, t.id, 'them', res.data.reply);
  person.lastContactDay = s.day;
  if (decision?.made) makeIntro(s, person, targetKind);
}

// Introduction made: a new person arrives by email (double opt-in), routed to CRM / investors / partners.
function makeIntro(s, via, wanted = 'customer') {
  const n = ensureNetwork(s);
  // Only intros they can genuinely make; if they don't actually know anyone of that kind, no intro.
  const kinds = via.knows ?? [];
  if (!kinds.length) { notify(s, `${via.name} tried, but doesn't actually know anyone suitable to introduce.`, { app: 'messages' }); return; }
  const kind = kinds.includes(wanted) ? wanted : pick(s, kinds);
  const { first, last, name } = personName(s, { register: false }); // two rng draws, as before; addPerson claims it
  const person = addPerson(s, { name, relation: kind === 'investor' ? 'investor' : kind === 'partner' ? 'partner' : 'customer', strength: 0.25, introducedBy: via.id, company: kind === 'investor' ? `${last} Capital` : `${last} ${pick(s, ['Labs', 'Group', 'Studio', 'Health', 'Logistics'])}`, email: `${emailSlug(first)}@${emailSlug(last)}.com`, channel: 'email' });
  const t = newThread(s, { subject: `Intro: ${s.founder.name} <> ${person.name}`, with: { name: via.name }, kind: 'network', app: 'messages', refId: null });
  addMessage(s, t.id, { from: 'them', body: `${person.name}, meet ${s.founder.name}, founder of ${s.company.name} (${s.company.oneLiner || 'see below'}). ${s.founder.name.split(' ')[0]}, meet ${person.name.split(' ')[0]}${kind === 'investor' ? ', who invests at this stage' : kind === 'customer' ? ', who deals with exactly this problem' : ', who might be a great partner'}. I'll let you two take it from here!` });
  n.intros.push({ id: uid('intro'), day: s.day, kind, via: via.name, personId: person.id, status: 'made' });
  if (kind === 'investor') n.investorLeads.push({ id: uid('il'), day: s.day, via: via.name, name: person.name, firm: person.company, email: person.email, warm: true, imported: false });
  else if (kind === 'customer') addInboundLead(s, { name: person.name, email: person.email, company: person.company, source: 'referral', note: `Warm intro from ${via.name}` });
  notify(s, `${via.name} introduced you to ${person.name} (${kind}). Follow up fast: warm intros go cold within days.`, { type: 'good', app: kind === 'investor' ? 'fundraising' : kind === 'customer' ? 'crm' : 'messages' });
}

async function genRoster(ctx) {
  const s = ctx.state;
  const n = ensureNetwork(s);
  if (n.rosterStatus === 'done') return;
  const nw = s.founder.network;
  const res = await ctx.llm.ask({
    task: 'network_roster',
    system: 'You generate the realistic personal and professional network of a specific founder, for a business simulation. Base it ONLY on their bio/LinkedIn and network sizes: e.g. ex-colleagues come from employers in their background, friends are mostly not in tech unless the bio suggests otherwise, and only people a realistic founder like this would know. Most contacts cannot help with the business: give a non-empty `knows` list to at most 4 of the 12 (only people with a concrete, plausible link to customers, investors, partners or hires for THIS company); everyone else gets `knows: []`. Return 12 contacts.',
    prompt: `Founder: ${s.founder.name}. Bio: ${s.founder.bio || 'not provided'}. LinkedIn: ${(s.founder.linkedinText || 'not provided').slice(0, 4000)}. Network sizes: ${nw.friends} close friends/family, ${nw.linkedin} LinkedIn connections, ${nw.x} followers. Their company: ${companyBrief(s)}`,
    schema: { type: 'object', additionalProperties: false, required: ['contacts'], properties: { contacts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'relation', 'strength', 'role', 'company', 'howTheyCanHelp', 'knows'], properties: { name: { type: 'string' }, relation: { type: 'string', enum: ['friend', 'family', 'ex_colleague', 'former_manager', 'classmate', 'acquaintance', 'founder_peer', 'angel'] }, strength: { type: 'number' }, role: { type: 'string' }, company: { type: 'string' }, howTheyCanHelp: { type: 'string' }, knows: { type: 'array', items: { type: 'string', enum: ['customer', 'investor', 'partner', 'hire'] } } } } } } },
    temperature: 0.8,
    maxTokens: 2000,
    fallback: () => ({ contacts: fallbackRoster(s) }),
  });
  for (const c of res.data.contacts.slice(0, 15)) addPerson(s, { ...c, strength: Math.min(1, Math.max(0, c.strength > 1 ? c.strength / 100 : c.strength)) });
  n.rosterStatus = 'done';
}

function fallbackRoster(s) {
  const nw = s.founder.network;
  const out = [];
  // A different set of people every game: the shared bank through a private per-game stream (the main rng sequence
  // does not move), unique among themselves now and claimed by addPerson.
  const r = nameStream(s, 'roster'), taken = new Set();
  const names = Array.from({ length: 12 }, () => personName(s, { rand: r, taken, register: false }).name);
  const rel = ['friend', 'friend', 'family', 'ex_colleague', 'ex_colleague', 'former_manager', 'classmate', 'acquaintance', 'acquaintance', 'founder_peer', 'ex_colleague', 'angel'];
  names.forEach((name, i) => {
    const r = rel[i];
    const knows = [];
    if (r === 'angel' || (r === 'founder_peer' && s.company.path === 'vc')) knows.push('investor');
    if (['ex_colleague', 'former_manager'].includes(r) && rng(s) < 0.5) knows.push('customer');
    if (r === 'founder_peer') knows.push('partner');
    if (r === 'ex_colleague' && rng(s) < 0.3) knows.push('hire');
    out.push({ name, relation: r, strength: { friend: 0.8, family: 0.9, ex_colleague: 0.45, former_manager: 0.5, classmate: 0.3, acquaintance: 0.15, founder_peer: 0.35, angel: 0.2 }[r], role: knows.length ? 'works in your industry' : '', company: '', howTheyCanHelp: knows.length ? `may know a ${knows.join('/')}` : 'moral support', knows });
  });
  if ((nw.linkedin ?? 0) < 100) out.splice(9);
  return out;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const CAT_TONE = { customer: 'good', investor: 'accent', partner: 'accent', press: 'accent', spam: 'bad', vendor: 'warn', event: 'warn', scam: 'bad' };

export default {
  id: 'messages',
  title: 'Messages',
  icon: '💬',
  group: 'Home',
  badge: (state) => (state.network?.threads ?? []).filter((t) => t.unread).length || null,
  jobs: { 'network:inbound': genInbound, 'reply:network': replyNetwork, 'text:reply': replyText, 'network:roster': genRoster },
  onDay(state) {
    // inbound generation runs in core/network.js; here: public noise (likes, upvotes) and opinions cited as evidence
    fakeSignalsDay(state);
  },
  render(root, ctx) {
    const s = ctx.state;
    const n = ensureNetwork(s);
    if (n.rosterStatus === 'none') { n.rosterStatus = 'pending'; ctx.enqueue('network:roster', {}, { label: 'Building your network' }); }
    const [tab = 'texts', openId] = (ctx.params || 'texts').split(':');
    const meetingInb = n.inbound.find((x) => x.id === ctx.params);
    if (meetingInb) { ctx.navigate('meetings', meetingInb.eventId ?? ''); return; } // calls live in Meetings now
    const threads = n.threads.filter((t) => (tab === 'linkedin' ? t.channel === 'linkedin' : t.channel !== 'linkedin')).sort((a, b) => (b.lastDay ?? 0) - (a.lastDay ?? 0)); // newest first, ties keep recency order
    const open = n.threads.find((t) => t.id === openId);
    if (open?.unread) { open.unread = false; ctx.save(); }
    const openPerson = open && n.people.find((p) => p.id === open.personId);
    const inboundList = n.inbound.filter((x) => x.status === 'delivered').slice().reverse().slice(0, 60);
    const aiOn = !!s.apps.inbox?.agent?.on;
    const waiting = !!open && (s.jobs ?? []).some((j) => j.type === 'text:reply' && j.payload?.threadId === open.id && ['pending', 'running'].includes(j.status));
    const roster = n.people.filter((p) => ['friend', 'family', 'ex_colleague', 'former_manager', 'classmate', 'acquaintance', 'founder_peer', 'angel'].includes(p.relation));
    mount(root, html`
      <div class="app-head"><div><h1>Messages</h1><p>Texts, LinkedIn DMs and everyone who reaches out. Who contacts you depends on what you're building and what you do in public. Most inbound wastes time; a little of it changes everything. Triage like a founder.</p></div></div>
      <div class="tabs">${[['texts', 'iMessage'], ['linkedin', 'LinkedIn'], ['inbound', `Inbound (${inboundList.filter((x) => !x.resolved && !x.declined).length})`], ['contacts', 'Your network'], ['intros', 'Intros & leads'], ['signals', 'Opinions & likes']].map(([k, l]) => html`<a href="#/messages/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${tab === 'texts' ? renderIMessage(s, n, threads, open, openPerson, waiting) : ''}
      ${tab === 'linkedin' ? renderLinkedIn(s, n, threads, open, openPerson, waiting) : ''}
      ${tab === 'inbound' ? html`<section class="panel">
        <p class="muted small">Every reply, call and "quick chat" costs real hours. Declining politely takes 3 minutes and keeps your reputation; ignoring is free but some opportunities go elsewhere. You only find out what something was worth by engaging.</p>
        ${aiOn ? html`<p class="small muted">AI labels come from your triage agent (Mail → AI triage). They are usually right and sometimes not.</p>` : ''}
        ${inboundList.length ? html`<div class="table-wrap"><table><thead><tr><th>Received</th><th>From</th><th>Channel</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>
          ${inboundList.map((x) => { const p = n.people.find((q) => q.id === x.personId); return html`<tr>
            <td class="small">${fmtDate(s, x.day)}</td><td><b>${p?.name}</b><div class="small muted">${p?.role}${p?.company ? ` · ${p.company}` : ''}</div></td>
            <td>${badge(x.channel, '')}${aiOn && x.aiLabel ? html`<br />${badge(AI_LABELS[x.aiLabel], x.aiLabel === 'cold' ? '' : 'accent')}` : ''}</td><td class="small">${x.subject ? html`<b>${x.subject}</b><br />` : ''}${x.preview}${x.feeAsk && !x.paid ? html`<br /><span class="neg">Asked for ${money(x.feeAsk.amount)} (${x.feeAsk.what})</span> <button class="sm" data-pay="${x.id}">Pay</button>` : ''}${x.paid ? html`<br />${badge(`paid ${money(x.paid.amount)}`, 'bad')}` : ''}${x.autoDeclined != null ? html`<br />${badge('auto-declined by AI', 'warn')}` : ''}</td>
            <td>${x.resolved ? badge(x.result === 'waste' ? 'went nowhere' : x.result.replaceAll('_', ' '), ['waste', 'scam', 'no_show_by_founder'].includes(x.result) ? '' : 'good') : x.declined ? badge('declined') : x.eventId ? html`<a href="#/meetings/${x.eventId}">${badge('call booked', 'accent')}</a>` : badge('open', 'warn')}</td>
            <td style="white-space:nowrap">${!x.resolved && !x.declined ? html`<a class="btn sm" href="${x.channel === 'email' ? `#/mail/inbox:${x.threadId}` : `#/messages/${x.channel === 'linkedin' ? 'linkedin' : 'texts'}:${x.threadId}`}">Reply</a> <button class="sm" data-decline="${x.id}">Decline</button>` : ''}</td></tr>`; })}
        </tbody></table></div>` : html`<p class="empty">No inbound yet. Inbound grows as you launch, post, announce and get known.</p>`}
      </section>` : ''}
      ${tab === 'contacts' ? html`<section class="panel">
        <h2>Your network ${n.rosterStatus === 'pending' ? html`<span class="small muted">generating from your bio and LinkedIn…</span>` : ''}</h2>
        <p class="muted small">Built from your bio and LinkedIn profile (add them in Fundraising → Founder profile) and your network sizes. Strong ties make intros; weak ties rarely do. Don't ask the same person for favors every week.</p>
        ${roster.length ? html`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Relationship</th><th>Strength</th><th>Work</th><th>Last contact</th><th></th></tr></thead><tbody>
          ${roster.map((p) => html`<tr><td><b>${p.name}</b></td><td>${p.relation.replace('_', ' ')}</td><td><div class="meter" style="width:70px"><div style="width:${p.strength * 100}%"></div></div></td><td class="small">${p.role}${p.company ? ` · ${p.company}` : ''}</td><td class="small">${fmtDate(s, p.lastContactDay)}</td><td><button class="sm" data-text="${p.id}">Text</button></td></tr>`)}
        </tbody></table></div>` : html`<p class="empty">No contacts yet.</p>`}
        <button id="addContact">Add a real contact</button>
      </section>` : ''}
      ${tab === 'signals' ? html`<section class="panel"><h2>Opinions and likes</h2>
        <p class="muted small">Investors, advisors, other founders, friends, likes and upvotes: confident views about your idea from people who do not have the problem. They feel like validation and are not. Real evidence is someone with the problem describing the last time it cost them, or paying.</p>
        ${opinions(s).length ? html`<div class="table-wrap"><table><thead><tr><th>Day</th><th>From</th><th>What they said</th><th></th></tr></thead><tbody>${opinions(s).slice().reverse().slice(0, 40).map((o) => html`<tr><td class="small">${fmtDate(s, o.day)}</td><td>${o.who}<div class="small muted">${o.kind}</div></td><td class="small">${o.text}</td><td>${o.tagged ? badge('logged as evidence', 'warn') : html`<button class="sm" data-tagsig="${o.id}">Count as validation</button>`}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No opinions or likes yet.</p>`}
      </section>` : ''}
      ${tab === 'intros' ? html`<div class="grid-2">
        <section class="panel"><h2>Intros made</h2>${n.intros.length ? html`<ul class="list">${n.intros.slice().reverse().map((i) => html`<li>${badge(i.kind, 'accent')} via ${i.via} · ${fmtDate(s, i.day)}</li>`)}</ul>` : html`<p class="empty">None yet.</p>`}</section>
        <section class="panel"><h2>Investor leads from your network</h2>${n.investorLeads.length ? html`<ul class="list">${n.investorLeads.slice().reverse().map((i) => html`<li>${i.name ?? 'Investor'}${i.firm ? ` · ${i.firm}` : ''} <span class="small muted">via ${i.via}</span> ${i.imported ? badge('in Fundraising', 'good') : ''}</li>`)}</ul><a class="btn sm" href="#/fundraising">Open Fundraising</a>` : html`<p class="empty">None yet.</p>`}</section>
      </div>` : ''}`);

    on(root, 'click', '[data-open]', (e, el) => ctx.navigate('messages', `${tab}:${el.dataset.open}`));
    on(root, 'input', '#textBody', (e) => { if (open) drafts[open.id] = e.target.value; autoGrow(e.target); });
    // Enter sends, Shift+Enter adds a new line (as in Messages and LinkedIn on desktop).
    on(root, 'keydown', '#textBody', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      if (e.target.value.trim()) e.target.form.requestSubmit();
    });
    // Client-side search and the LinkedIn "Unread" filter: they only hide rows, state is untouched.
    on(root, 'input', '[data-search]', (e) => {
      const q = e.target.value.trim().toLowerCase();
      root.querySelectorAll('[data-name]').forEach((li) => { li.hidden = q && !li.dataset.name.includes(q); });
    });
    on(root, 'click', '[data-unread-filter]', (e, el) => {
      const onlyUnread = el.classList.toggle('on');
      el.parentElement.querySelector('[data-all]')?.classList.toggle('on', !onlyUnread);
      root.querySelector('.li')?.classList.toggle('only-unread', onlyUnread);
    });
    on(root, 'click', '[data-all]', (e, el) => {
      el.classList.add('on');
      el.parentElement.querySelector('[data-unread-filter]')?.classList.remove('on');
      root.querySelector('.li')?.classList.remove('only-unread');
    });
    const scroller = root.querySelector('[data-scroll-end]');
    if (scroller) {
      const toEnd = () => { scroller.scrollTop = scroller.scrollHeight; };
      toEnd();
      requestAnimationFrame(toEnd);
      const box = root.querySelector('#textBody');
      if (box) {
        autoGrow(box);
        if (refocus && open?.id === refocus) { refocus = null; box.focus(); }
      }
    }
    on(root, 'submit', '#textForm', (e) => {
      e.preventDefault();
      refocus = open?.id ?? null;
      const { body } = formData(e.target);
      ctx.act((st) => {
        addText(st, open.id, 'me', body);
        delete drafts[open.id];
        const p = ensureNetwork(st).people.find((x) => x.id === open.personId);
        if (p) p.lastContactDay = st.day;
        ctx.enqueue('text:reply', { threadId: open.id }, { label: 'Waiting for a reply' });
      }, { hours: Math.min(0.4, 0.05 + words(body) / 500), label: 'Texting' });
    });
    on(root, 'click', '[data-text]', (e, el) => ctx.act((st) => { const t = textThreadFor(st, el.dataset.text); ctx.navigate('messages', `texts:${t.id}`); }));
    on(root, 'click', '[data-tagsig]', (e, el) => ctx.act((st) => { tagAsValidation(st, el.dataset.tagsig); toast('Logged as evidence. Opinions are not demand: nobody with the problem said this.', 'warn'); }, { hours: 0.1, label: 'Logging evidence' }));
    on(root, 'click', '[data-pay]', (e, el) => { if (confirm('Pay this invoice from the company account?')) ctx.act((st) => payInboundFee(st, el.dataset.pay), { hours: 0.1, label: 'Paying an invoice' }); });
    on(root, 'click', '[data-decline]', (e, el) => ctx.act((st) => {
      const x = ensureNetwork(st).inbound.find((q) => q.id === el.dataset.decline);
      x.declined = true;
    }, { hours: 0.05, label: 'Polite no' }));
    on(root, 'click', '#addContact', () => modal({
      title: 'Add a real contact',
      body: html`<label>Name <input name="name" required /></label><div class="grid-2"><label>Relationship <select name="relation">${['friend', 'family', 'ex_colleague', 'former_manager', 'classmate', 'acquaintance', 'founder_peer', 'angel'].map((r) => html`<option value="${r}">${r.replace('_', ' ')}</option>`)}</select></label>
        <label>How close (0–100) <input type="number" name="strength" min="0" max="100" value="40" /></label></div>
        <label>Role & company <input name="role" placeholder="Head of Ops at Acme" /></label>
        <label>Who they know / how they could help <input name="help" placeholder="Knows 3 Shopify store owners; angel invests occasionally" /></label>
        <fieldset><legend>They could introduce you to</legend>${['customer', 'investor', 'partner', 'hire'].map((k) => html`<label style="display:inline-block;margin-right:10px"><input type="checkbox" name="k_${k}" /> ${k}</label>`)}</fieldset>`,
      actions: [{ label: 'Cancel' }, { label: 'Add', primary: true, onClick: (d, form) => {
        const f = formData(form);
        // Closeness is capped by the kind of relationship, and "they know a customer/investor" is a hope,
        // not a fact: each claim only holds ~60% of the time, revealed when you actually ask.
        const cap = { family: 0.95, friend: 0.85, former_manager: 0.6, ex_colleague: 0.55, founder_peer: 0.5, classmate: 0.4, angel: 0.35, acquaintance: 0.25 }[f.relation] ?? 0.4;
        ctx.act((st) => {
          const claimed = ['customer', 'investor', 'partner', 'hire'].filter((k) => f[`k_${k}`]);
          const knows = claimed.filter(() => rng(st) < 0.6);
          addPerson(st, { name: f.name, relation: f.relation, strength: Math.min(cap, (f.strength ?? 40) / 100), role: f.role, howTheyCanHelp: f.help, knows, claimedKnows: claimed, userAdded: true });
        }, { hours: 0.15, label: 'Updating contacts' });
      } }],
    }));
  },
};

// ---------------------------------------------------------------------------
// Thread views: iMessage (Apple Messages) and LinkedIn messaging look-alikes.
// Messages carry only a game day; the clock times shown are cosmetic, derived from the thread
// and message position so they increase within a day and stay the same across renders.
// ---------------------------------------------------------------------------

let refocus = null;
const KNOWN = ['friend', 'family', 'ex_colleague', 'former_manager', 'classmate', 'acquaintance', 'founder_peer', 'angel'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = (str) => parseInt(hash(str), 36);
const initials = (name) => String(name ?? '?').split(/\s+/).filter((w) => /\w/.test(w)).slice(0, 2).map((w) => w.replace(/^\W+/, '')[0].toUpperCase()).join('') || '?';
const LI_COLORS = ['#7a5c3e', '#3c6e8f', '#5b6f3a', '#8a4b6b', '#4b5a8a', '#9a5a2c', '#2f7a72', '#6c5a9a'];
const liColor = (name) => LI_COLORS[num(String(name ?? '')) % LI_COLORS.length];

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
}

function clockTimes(t) {
  let prevDay = null, min = 0;
  return t.messages.map((m, i) => {
    if (m.day !== prevDay) { prevDay = m.day; min = 8 * 60 + 15 + (num(`${t.id}:${m.day}`) % (9 * 60)); }
    else min += 1 + (num(`${t.id}:${i}`) % 9);
    return Math.min(min, 23 * 60 + 55);
  });
}
const fmtClock = (min) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, '0')} ${min >= 720 ? 'PM' : 'AM'}`;

function dayParts(s, day) {
  const d = dateOf(s, day);
  return { wd: d.getUTCDay(), mo: d.getUTCMonth(), dd: d.getUTCDate(), yy: d.getUTCFullYear() };
}
// iMessage: "Today 9:41 AM", "Yesterday 6:02 PM", "Tuesday 9:41 AM", "Tue, Oct 3 at 9:41 AM"
function imsgStamp(s, day, min) {
  const ago = s.day - day, p = dayParts(s, day);
  const label = ago <= 0 ? 'Today' : ago === 1 ? 'Yesterday' : ago < 7 ? WEEKDAYS[p.wd] : `${WEEKDAYS[p.wd].slice(0, 3)}, ${MONTHS[p.mo]} ${p.dd}`;
  return html`<b>${label}</b>${ago >= 7 ? ' at ' : ' '}${fmtClock(min)}`;
}
// Conversation list: time today, "Yesterday", weekday this week, else a short date.
function imsgListDate(s, day, min) {
  const ago = s.day - day, p = dayParts(s, day);
  return ago <= 0 ? fmtClock(min) : ago === 1 ? 'Yesterday' : ago < 7 ? WEEKDAYS[p.wd] : `${p.mo + 1}/${p.dd}/${String(p.yy).slice(2)}`;
}
function liListDate(s, day, min) {
  const ago = s.day - day, p = dayParts(s, day), now = dayParts(s, s.day);
  return ago <= 0 ? fmtClock(min) : `${MONTHS[p.mo]} ${p.dd}${p.yy !== now.yy ? `, ${p.yy}` : ''}`;
}
function liDayLabel(s, day) {
  const ago = s.day - day, p = dayParts(s, day), now = dayParts(s, s.day);
  return ago <= 0 ? 'Today' : ago === 1 ? 'Yesterday' : ago < 7 ? WEEKDAYS[p.wd] : `${MONTHS[p.mo]} ${p.dd}${p.yy !== now.yy ? `, ${p.yy}` : ''}`;
}

function personLine(p) {
  if (!p) return '';
  return p.role ? `${p.role}${p.company ? ` at ${p.company}` : ''}` : (p.relation ?? '').replaceAll('_', ' ');
}

const SEND_ICON = html`<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const INTRO_HINT = 'To ask for an intro, say who you want to meet and include a 2–3 sentence forwardable blurb.';

function renderIMessage(s, n, threads, open, person, waiting) {
  const rows = threads.map((t) => {
    const p = n.people.find((x) => x.id === t.personId);
    const last = t.messages.at(-1);
    const times = clockTimes(t);
    return html`<li class="imsg-row ${t.id === open?.id ? 'sel' : ''} ${t.unread ? 'unread' : ''}" data-open="${t.id}" data-name="${(p?.name ?? '').toLowerCase()}">
      <span class="imsg-dot" aria-label="${t.unread ? 'Unread' : ''}"></span>
      <span class="imsg-av">${initials(p?.name)}</span>
      <div class="imsg-row-main">
        <div class="imsg-row-top"><span class="imsg-row-name">${p?.name ?? 'Unknown'}</span><span class="imsg-row-date">${last ? imsgListDate(s, last.day, times.at(-1)) : ''}</span></div>
        <div class="imsg-row-prev">${last?.body ?? 'No messages yet'}</div>
      </div></li>`;
  });
  let body = '';
  if (open) {
    const times = clockTimes(open);
    const msgs = open.messages;
    const lastMine = msgs.length && msgs.at(-1).from === 'me' ? msgs.length - 1 : -1;
    body = msgs.map((m, i) => {
      const prev = msgs[i - 1], next = msgs[i + 1];
      const newDay = !prev || prev.day !== m.day;
      const tail = !next || next.from !== m.from || next.day !== m.day;
      const groupStart = newDay || prev.from !== m.from;
      return html`${newDay ? html`<div class="imsg-stamp">${imsgStamp(s, m.day, times[i])}</div>` : ''}<div class="imsg-b ${m.from === 'me' ? 'me' : 'them'} ${tail ? 'tail' : ''} ${groupStart ? 'start' : ''}">${m.body}</div>${i === lastMine ? html`<div class="imsg-receipt">${waiting ? 'Delivered' : 'Read'}</div>` : ''}`;
    });
  }
  return html`<div class="imsg ${open ? 'has-open' : ''}">
    <aside class="imsg-side">
      <div class="imsg-side-head"><label class="imsg-search"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="6.8" cy="6.8" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10.6 10.6 3.6 3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input type="search" placeholder="Search" data-search aria-label="Search conversations" /></label></div>
      ${threads.length ? html`<ul class="imsg-list">${rows}</ul>` : html`<p class="imsg-empty-list">No conversations. Text someone from <a href="#/messages/contacts">Your network</a>.</p>`}
    </aside>
    <section class="imsg-main">${open ? html`
      <header class="imsg-head">
        <a class="imsg-back" href="#/messages/texts" aria-label="Back to conversations"><svg viewBox="0 0 12 20" width="11" height="18" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        <div class="imsg-head-who"><span class="imsg-av lg">${initials(person?.name)}</span><span class="imsg-head-name">${person?.name ?? 'Unknown'} <span class="imsg-chev">›</span></span></div>
        <span class="imsg-head-sub">${personLine(person)}</span>
      </header>
      <div class="imsg-scroll" data-scroll-end>
        <div class="imsg-thread">${open.messages.length ? body : html`<div class="imsg-stamp"><b>iMessage</b></div>`}
        ${waiting ? html`<div class="imsg-b them tail start imsg-typing" aria-label="${person?.name ?? 'They'} is typing"><i></i><i></i><i></i></div>` : ''}</div>
      </div>
      <form id="textForm" class="imsg-compose">
        <span class="imsg-plus" aria-hidden="true">+</span>
        <div class="imsg-field"><textarea id="textBody" name="body" rows="1" placeholder="iMessage" required>${drafts[open.id] ?? ''}</textarea><button class="primary imsg-send" aria-label="Send">${SEND_ICON}</button></div>
      </form>
      <p class="imsg-hint">${INTRO_HINT} Enter sends, Shift+Enter adds a line.</p>` : html`<div class="imsg-none">No Conversation Selected</div>`}
    </section>
  </div>`;
}

function renderLinkedIn(s, n, threads, open, person, waiting) {
  const me = s.founder?.name ?? 'You';
  const myLine = `Founder at ${s.company?.name ?? 'my company'}`;
  const rows = threads.map((t) => {
    const p = n.people.find((x) => x.id === t.personId);
    const last = t.messages.at(-1);
    const times = clockTimes(t);
    const who = last ? (last.from === 'me' ? 'You' : (p?.name ?? '').split(' ')[0]) : '';
    return html`<li class="li-row ${t.id === open?.id ? 'sel' : ''} ${t.unread ? 'unread' : ''}" data-open="${t.id}" data-name="${(p?.name ?? '').toLowerCase()}">
      <span class="li-av" style="background:${liColor(p?.name)}">${initials(p?.name)}</span>
      <div class="li-row-main">
        <div class="li-row-top"><span class="li-row-name">${p?.name ?? 'Unknown'}</span><span class="li-row-date">${last ? liListDate(s, last.day, times.at(-1)) : ''}</span></div>
        <div class="li-row-prev">${last ? html`${who}: ${last.body}` : personLine(p)}</div>
      </div>${t.unread ? html`<span class="li-unread-dot" aria-label="Unread"></span>` : ''}</li>`;
  });
  let body = '';
  if (open) {
    const times = clockTimes(open);
    const msgs = open.messages;
    body = msgs.map((m, i) => {
      const prev = msgs[i - 1];
      const newDay = !prev || prev.day !== m.day;
      const groupStart = newDay || prev.from !== m.from;
      const mine = m.from === 'me';
      const name = mine ? me : person?.name ?? 'Unknown';
      return html`${newDay ? html`<div class="li-day"><span>${liDayLabel(s, m.day)}</span></div>` : ''}${groupStart ? html`<div class="li-grp-head"><span class="li-av sm" style="background:${mine ? '#0a66c2' : liColor(person?.name)}">${initials(name)}</span><b class="li-grp-name">${name}</b><span class="li-grp-time"> • ${fmtClock(times[i])}</span></div>` : ''}<div class="li-text">${m.body}</div>`;
    });
  }
  return html`<div class="li ${open ? 'has-open' : ''}">
    <aside class="li-side">
      <div class="li-side-head"><h2>Messaging</h2><span class="li-me" title="${me}" style="background:#0a66c2">${initials(me)}</span></div>
      <label class="li-search"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="6.8" cy="6.8" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10.6 10.6 3.6 3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><input type="search" placeholder="Search messages" data-search aria-label="Search messages" /></label>
      <div class="li-pills"><button type="button" class="li-pill on" data-all>Focused</button><button type="button" class="li-pill" data-unread-filter>Unread</button></div>
      ${threads.length ? html`<ul class="li-list">${rows}</ul>` : html`<p class="li-empty-list">No messages yet. LinkedIn DMs arrive as you post, launch and get known.</p>`}
    </aside>
    <section class="li-main">${open ? html`
      <header class="li-head">
        <a class="li-back" href="#/messages/linkedin" aria-label="Back to messages"><svg viewBox="0 0 12 20" width="10" height="16" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
        <div class="li-head-who"><b>${person?.name ?? 'Unknown'}</b><span>${personLine(person)}</span></div>
      </header>
      <div class="li-scroll" data-scroll-end>
        <div class="li-profile"><span class="li-av xl" style="background:${liColor(person?.name)}">${initials(person?.name)}</span>
          <div><b>${person?.name ?? 'Unknown'}</b>${KNOWN.includes(person?.relation) ? html` <span class="li-deg">• 1st</span>` : ''}<div class="li-profile-line">${personLine(person)}</div></div></div>
        ${body}
        ${waiting ? html`<div class="li-typing"><span class="li-av sm" style="background:${liColor(person?.name)}">${initials(person?.name)}</span><span class="li-typing-dots"><i></i><i></i><i></i></span></div>` : ''}
      </div>
      <form id="textForm" class="li-compose">
        <textarea id="textBody" name="body" rows="3" placeholder="Write a message…" required>${drafts[open.id] ?? ''}</textarea>
        <div class="li-compose-foot">
          <span class="li-tools" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="m4 18 5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M16.5 7.5 9 15a2.1 2.1 0 0 1-3-3l8-8a3.5 3.5 0 0 1 5 5l-8.5 8.5a5 5 0 0 1-7-7L11 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <span class="li-gif">GIF</span>
            <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/><path d="M8 14.5c1 1.4 2.4 2 4 2s3-.6 4-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </span>
          <button class="primary li-send">Send</button>
        </div>
      </form>
      <p class="li-hint">${INTRO_HINT} Writing as ${me} · ${myLine}. Enter sends, Shift+Enter adds a line.</p>` : html`<div class="li-none"><b>Select a conversation</b><span>Pick a message from the list to read it.</span></div>`}
    </section>
  </div>`;
}
