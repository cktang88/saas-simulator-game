// Messages (iMessage + LinkedIn DMs) and inbound triage. People contact you based on what your
// business is and what you've done publicly (core/network.js). You decide what to engage with:
// some contacts waste your week, some lead to customers, investors, partners or hires.
// You can also text your own network: ask for intros, catch up, get advice.

import { html, mount, on, formData, modal, toast, badge } from '../core/ui.js';
import { ensureNetwork, addPerson, textThreadFor, addText, deliverInbound, resolveInbound, introDecision, archetypes, companyStage, recordPublicEvent } from '../core/network.js';
import { REALISM } from '../core/llm.js';
import { newThread, addMessage, ensureMail } from '../core/mail.js';
import { scheduleEvent, findSlots, fmtTime, ensureCalendar, completeEvent } from '../core/calendar.js';
import { addInboundLead } from './sales/crm-api.js';
import { fmtDate, words, pick, rng, uid } from '../core/util.js';
import { notify } from '../core/state.js';

const drafts = {};
const chatDraft = {};

// ---------------------------------------------------------------------------
// Prompts & fallbacks
// ---------------------------------------------------------------------------

const OUTCOME_GUIDE = {
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

function companyBrief(s) {
  const pub = (s.network?.publicEvents ?? []).filter((e) => s.day - e.day < 30).map((e) => e.type.replaceAll('_', ' '));
  return `Company: ${s.company.name}. What it does: ${s.company.oneLiner || 'not stated'}. Customers: ${s.company.icp || 'not stated'}. Model: ${s.company.model}. Stage: ${companyStage(s)}. Website: ${s.company.website?.title ?? 'none'} ${s.company.website?.description ?? ''}. Founder: ${s.founder.name}. Recent public activity: ${pub.join(', ') || 'none'}.`;
}

function fallbackInbound(s, a, inb) {
  const first = pick(s, ['Jordan', 'Priya', 'Marco', 'Lena', 'Dev', 'Aisha', 'Tom', 'Yuki', 'Carlos', 'Nina']);
  const last = pick(s, ['Hale', 'Shah', 'Rossi', 'Kim', 'Okafor', 'Novak', 'Reyes', 'Berg']);
  const co = { vendor: 'Growthly Agency', spam: 'LeadBoost', recruiter: 'TalentBridge', investor: 'Northbeam Ventures', customer: `${last} & Co`, partner: 'Stackwise', press: 'The Indie Wire', event: 'SaaS Summit Global', advisor: 'Self-employed', founder_peer: 'a stealth startup', acquirer: 'Corp Dev, Atlas Software', candidate: 'Freelance', friend: '', competitor: 'a "consultancy"' }[a.category] ?? 'Unknown';
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
    senderName: `${first} ${last}`, senderRole: a.label, senderCompany: co, senderEmail: `${first.toLowerCase()}@${co.toLowerCase().replace(/[^a-z]/g, '') || 'gmail'}.com`,
    subject: a.category === 'friend' ? '' : `${s.company.name}`, message: body, hiddenAgenda: `${a.label}; true outcome: ${inb.outcome}`,
  };
}

function fallbackReply(s, inb, founderMsg) {
  const engaged = inb.engaged;
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
    task: 'network_inbound',
    system: `You write ONE realistic message that a founder received in late 2026, exactly as it would arrive. Channel: ${inb.channel === 'imessage' ? 'iMessage text (short, casual, no subject; only from someone who has their number)' : inb.channel === 'linkedin' ? 'LinkedIn DM (semi-formal, 2–5 sentences)' : 'email (subject + body)'}. Sender type: ${a.label}. ${a.promptHint ?? ''}\nThe message must reference the founder's actual business and any recent public activity naturally, the way that kind of sender really would (many senders only skimmed the website). Do not use placeholders.\nHIDDEN TRUTH (never state it): ${OUTCOME_GUIDE[inb.outcome] ?? ''} ${inb.outcome === 'waste' || inb.outcome === 'scam' ? `Subtle red flags to weave in: ${(a.redFlags ?? []).join('; ')}` : ''}`,
    prompt: companyBrief(s),
    schema: GEN_SCHEMA,
    temperature: 0.95,
    maxTokens: 600,
    fallback: () => fallbackInbound(s, a, inb),
  });
  deliverInbound(s, inb, res.data);
}

async function personReply(ctx, inb, history, founderMsg) {
  const s = ctx.state;
  const n = ensureNetwork(s);
  const person = n.people.find((p) => p.id === inb.personId);
  const res = await ctx.llm.ask({
    task: 'network_reply',
    system: `${REALISM}\nYou are ${person?.name}, ${person?.role} at ${person?.company}. You contacted the founder of ${s.company.name}. Your private agenda: ${person?.persona}. HIDDEN TRUTH about what you'll really do: ${OUTCOME_GUIDE[inb.outcome] ?? ''} Stay consistent with it; reveal it gradually through what you do, not by announcing it. Write like a real person on ${inb.channel === 'email' ? 'email' : inb.channel}; keep it short.`,
    prompt: `${companyBrief(s)}\n\nConversation so far:\n${history.map((m) => `${m.from === 'me' ? s.founder.name : person?.name}: ${m.body}`).join('\n')}\n\nThe founder just wrote: "${founderMsg}"\nReply in character.`,
    schema: REPLY_SCHEMA,
    temperature: 0.8,
    maxTokens: 400,
    fallback: () => fallbackReply(s, inb, founderMsg),
  });
  return res.data;
}

function maybeBookCall(s, inb, person) {
  if (inb.eventId) return null;
  const cal = ensureCalendar(s);
  const slot = findSlots(s, { fromDay: s.day + (cal.bookingLink ? 1 : 2), duration: 30, count: 1 })[0];
  if (!slot) return null;
  const ev = scheduleEvent(s, { title: `Call: ${person.name}`, kind: 'meeting', app: 'messages', refId: inb.id, with: { name: person.name, email: person.email }, day: slot.day, start: slot.start, duration: 30, location: 'Video call' });
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
  inb.engaged++;
  const r = await personReply(ctx, inb, t.messages, last);
  addMessage(s, t.id, { from: 'them', body: r.reply });
  const person = n.people.find((p) => p.id === inb.personId);
  if (r.wantsCall) {
    const ev = maybeBookCall(s, inb, person);
    if (ev) addMessage(s, t.id, { from: 'them', body: `(Calendar invite: ${fmtDate(s, ev.day)} ${fmtTime(ev.start)}, 30 min)` });
  }
  if ((r.outcomeReady && inb.engaged >= 2 && ['waste', 'scam', 'advice', 'press'].includes(inb.outcome)) || (r.outcomeReady && inb.engaged >= 4)) resolveInbound(s, inb, { addInboundLead });
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
    inb.engaged++;
    const r = await personReply(ctx, inb, t.messages, last);
    addText(s, t.id, 'them', r.reply);
    if (r.wantsCall) { const ev = maybeBookCall(s, inb, person); if (ev) addText(s, t.id, 'them', `sent you an invite for ${fmtDate(s, ev.day)} ${fmtTime(ev.start)} 👍`); }
    if ((r.outcomeReady && inb.engaged >= 2 && ['waste', 'scam', 'advice', 'press'].includes(inb.outcome)) || (r.outcomeReady && inb.engaged >= 4)) resolveInbound(s, inb, { addInboundLead });
    return;
  }
  // Your own contact (friend, ex-colleague...). Intro requests follow the research intro funnel.
  const asksIntro = /intro|introduce|connect me|know anyone|put me in touch|warm/i.test(last);
  const targetKind = /investor|vc|angel|raise|fund/i.test(last) ? 'investor' : /hire|engineer|designer|candidate/i.test(last) ? 'hire' : /partner|integration/i.test(last) ? 'partner' : 'customer';
  const decision = asksIntro ? introDecision(s, person, { message: last, targetKind }) : null;
  const res = await ctx.llm.ask({
    task: 'network_text',
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
  const kinds = via.knows?.length ? via.knows : ['customer'];
  const kind = kinds.includes(wanted) ? wanted : pick(s, kinds);
  const first = pick(s, ['Avery', 'Rohan', 'Elena', 'Marcus', 'Hannah', 'Kofi', 'Isabel', 'Wen']);
  const last = pick(s, ['Lind', 'Patel', 'Morales', 'Becker', 'Owusu', 'Ito', 'Grant']);
  const person = addPerson(s, { name: `${first} ${last}`, relation: kind === 'investor' ? 'investor' : kind === 'partner' ? 'partner' : 'customer', strength: 0.25, introducedBy: via.id, company: kind === 'investor' ? `${last} Capital` : `${last} ${pick(s, ['Labs', 'Group', 'Studio', 'Health', 'Logistics'])}`, email: `${first.toLowerCase()}@${last.toLowerCase()}.com`, channel: 'email' });
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
    system: 'You generate the realistic personal and professional network of a specific founder, for a business simulation. Base it ONLY on their bio/LinkedIn and network sizes: e.g. ex-colleagues come from employers in their background, friends are mostly not in tech unless the bio suggests otherwise, and only people a realistic founder like this would know. Most contacts cannot help with the business; a few can. Return 12 contacts.',
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
  const names = ['Chris Walsh', 'Mia Torres', 'Ben Adler', 'Sara Lindqvist', 'Omar Haddad', 'Julia Brandt', 'Ravi Menon', 'Emma Clarke', 'Leo Fischer', 'Hana Sato', 'Dan Murphy', 'Zara Khan'];
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
    // nothing extra: inbound generation runs in core/network.js
  },
  render(root, ctx) {
    const s = ctx.state;
    const n = ensureNetwork(s);
    if (n.rosterStatus === 'none') { n.rosterStatus = 'pending'; ctx.enqueue('network:roster', {}, { label: 'Building your network' }); }
    const [tab = 'texts', openId] = (ctx.params || 'texts').split(':');
    const meetingInb = n.inbound.find((x) => x.id === ctx.params);
    if (meetingInb) return renderMeeting(root, ctx, meetingInb);
    const threads = n.threads.filter((t) => (tab === 'linkedin' ? t.channel === 'linkedin' : t.channel !== 'linkedin'));
    const open = n.threads.find((t) => t.id === openId);
    if (open?.unread) { open.unread = false; ctx.save(); }
    const openPerson = open && n.people.find((p) => p.id === open.personId);
    const inboundList = n.inbound.filter((x) => x.status === 'delivered').slice().reverse().slice(0, 60);
    const roster = n.people.filter((p) => ['friend', 'family', 'ex_colleague', 'former_manager', 'classmate', 'acquaintance', 'founder_peer', 'angel'].includes(p.relation));
    mount(root, html`
      <div class="app-head"><div><h1>Messages</h1><p>Texts, LinkedIn DMs and everyone who reaches out. Who contacts you depends on what you're building and what you do in public. Most inbound wastes time; a little of it changes everything. Triage like a founder.</p></div></div>
      <div class="tabs">${[['texts', 'iMessage'], ['linkedin', 'LinkedIn'], ['inbound', `Inbound (${inboundList.filter((x) => !x.resolved && !x.declined).length})`], ['contacts', 'Your network'], ['intros', 'Intros & leads']].map(([k, l]) => html`<a href="#/messages/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${tab === 'texts' || tab === 'linkedin' ? html`
        <div class="grid-2" style="grid-template-columns: minmax(220px,1fr) 2fr">
          <section class="panel" style="padding:0">${threads.length ? html`<ul class="list">${threads.map((t) => { const p = n.people.find((x) => x.id === t.personId); return html`<li style="padding:10px 14px;cursor:pointer;${t.id === openId ? 'background:var(--accent-soft)' : ''}" data-open="${t.id}"><b>${t.unread ? '● ' : ''}${p?.name ?? 'Unknown'}</b> <span class="small muted">${fmtDate(s, t.lastDay)}</span><div class="small muted">${(t.messages.at(-1)?.body ?? '').slice(0, 70)}</div></li>`; })}</ul>` : html`<p class="empty" style="padding:14px">No conversations. Text someone from Your network.</p>`}</section>
          <section class="panel">${open ? html`
            <h2>${openPerson?.name} <span class="small muted">${openPerson?.role ? `${openPerson.role}${openPerson.company ? ` · ${openPerson.company}` : ''}` : openPerson?.relation?.replace('_', ' ')}</span></h2>
            <div class="chat">${open.messages.map((m) => html`<div class="msg ${m.from}">${m.body}<div class="small" style="opacity:.6">${fmtDate(s, m.day)}</div></div>`)}</div>
            <form id="textForm" style="margin-top:8px"><textarea id="textBody" name="body" rows="2" placeholder="${open.channel === 'linkedin' ? 'Write a message…' : 'iMessage'}" required>${drafts[open.id] ?? ''}</textarea><button class="primary">Send</button>
              <span class="hint">To ask for an intro, say who you want to meet and include a 2–3 sentence forwardable blurb.</span></form>` : html`<p class="empty">Pick a conversation.</p>`}</section>
        </div>` : ''}
      ${tab === 'inbound' ? html`<section class="panel">
        <p class="muted small">Every reply, call and "quick chat" costs real hours. Declining politely takes 3 minutes and keeps your reputation; ignoring is free but some opportunities go elsewhere. You only find out what something was worth by engaging.</p>
        ${inboundList.length ? html`<div class="table-wrap"><table><thead><tr><th>Received</th><th>From</th><th>Channel</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>
          ${inboundList.map((x) => { const p = n.people.find((q) => q.id === x.personId); return html`<tr>
            <td class="small">${fmtDate(s, x.day)}</td><td><b>${p?.name}</b><div class="small muted">${p?.role}${p?.company ? ` · ${p.company}` : ''}</div></td>
            <td>${badge(x.channel, '')}</td><td class="small">${x.subject ? html`<b>${x.subject}</b><br />` : ''}${x.preview}</td>
            <td>${x.resolved ? badge(x.result === 'waste' ? 'went nowhere' : x.result.replaceAll('_', ' '), ['waste', 'scam', 'no_show_by_founder'].includes(x.result) ? '' : 'good') : x.declined ? badge('declined') : x.eventId ? badge('call booked', 'accent') : badge('open', 'warn')}</td>
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
      ${tab === 'intros' ? html`<div class="grid-2">
        <section class="panel"><h2>Intros made</h2>${n.intros.length ? html`<ul class="list">${n.intros.slice().reverse().map((i) => html`<li>${badge(i.kind, 'accent')} via ${i.via} · ${fmtDate(s, i.day)}</li>`)}</ul>` : html`<p class="empty">None yet.</p>`}</section>
        <section class="panel"><h2>Investor leads from your network</h2>${n.investorLeads.length ? html`<ul class="list">${n.investorLeads.slice().reverse().map((i) => html`<li>${i.name ?? 'Investor'}${i.firm ? ` · ${i.firm}` : ''} <span class="small muted">via ${i.via}</span> ${i.imported ? badge('in Fundraising', 'good') : ''}</li>`)}</ul><a class="btn sm" href="#/fundraising">Open Fundraising</a>` : html`<p class="empty">None yet.</p>`}</section>
      </div>` : ''}`);

    on(root, 'click', '[data-open]', (e, el) => ctx.navigate('messages', `${tab}:${el.dataset.open}`));
    on(root, 'input', '#textBody', (e) => { if (open) drafts[open.id] = e.target.value; });
    on(root, 'submit', '#textForm', (e) => {
      e.preventDefault();
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
        ctx.act((st) => addPerson(st, { name: f.name, relation: f.relation, strength: (f.strength ?? 40) / 100, role: f.role, howTheyCanHelp: f.help, knows: ['customer', 'investor', 'partner', 'hire'].filter((k) => f[`k_${k}`]) }));
      } }],
    }));
  },
};

function renderMeeting(root, ctx, inb) {
  const s = ctx.state;
  const n = ensureNetwork(s);
  const person = n.people.find((p) => p.id === inb.personId);
  const ev = (s.calendar?.events ?? []).find((e) => e.id === inb.eventId);
  const chat = (inb.call ??= []);
  const live = ev && ev.status === 'scheduled' && ev.day === s.day;
  mount(root, html`
    <div class="app-head"><div><h1>Call with ${person?.name}</h1><p>${person?.role}${person?.company ? ` · ${person.company}` : ''}${ev ? ` · ${fmtDate(s, ev.day)} ${fmtTime(ev.start)}` : ''}</p></div><div class="app-actions"><a class="btn" href="#/messages/inbound">Back</a></div></div>
    <section class="panel">
      ${!ev ? html`<p class="muted">No call booked.</p>` : !live && ev.status === 'scheduled' ? html`<p class="muted">This call is scheduled for ${fmtDate(s, ev.day)}. Come back on the day (Calendar → Join).</p>` : ''}
      ${live || chat.length ? html`<div class="chat">${chat.map((m) => html`<div class="msg ${m.from}">${m.body}</div>`)}</div>` : ''}
      ${live ? html`<form id="callForm" style="margin-top:8px"><textarea id="callBody" name="body" rows="2" placeholder="Say something…" required>${chatDraft[inb.id] ?? ''}</textarea>
        <div class="inline"><button class="primary">Say</button><button type="button" id="endCall">End call</button></div></form>` : ''}
      ${inb.resolved ? html`<div class="callout ${['waste', 'scam'].includes(inb.result) ? '' : 'good'}">Outcome: ${inb.result.replaceAll('_', ' ')}</div>` : ''}
    </section>`);
  on(root, 'input', '#callBody', (e) => { chatDraft[inb.id] = e.target.value; });
  on(root, 'submit', '#callForm', async (e) => {
    e.preventDefault();
    const { body } = formData(e.target);
    delete chatDraft[inb.id];
    await ctx.act(async (st) => {
      const x = ensureNetwork(st).inbound.find((q) => q.id === inb.id);
      x.call.push({ from: 'me', body });
      x.engaged++;
      const r = await personReply(ctx, x, x.call, body);
      x.call.push({ from: 'them', body: r.reply });
    }); // the calendar already charged this call's time
  });
  on(root, 'click', '#endCall', () => ctx.act((st) => {
    const x = ensureNetwork(st).inbound.find((q) => q.id === inb.id);
    const e = (st.calendar?.events ?? []).find((q) => q.id === x.eventId);
    if (e) completeEvent(st, e.id, 'done');
    const msg = resolveInbound(st, x, { addInboundLead });
    if (msg) toast(msg, ['waste', 'scam'].includes(x.outcome) ? 'info' : 'good');
  }));
}
