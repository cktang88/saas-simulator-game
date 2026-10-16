// Ticket categories, priorities, fallback templates and LLM schemas for the Helpdesk. Pure.

export const CATEGORIES = {
  howto: { label: 'How-to / setup', weight: 0.4, priority: 'normal' },
  bug: { label: 'Bug report', weight: 0.2, priority: 'high' },
  billing: { label: 'Billing', weight: 0.12, priority: 'high' },
  feature: { label: 'Feature request', weight: 0.15, priority: 'low' },
  account: { label: 'Account / access', weight: 0.08, priority: 'normal' },
  outage: { label: 'Something is down', weight: 0, priority: 'urgent' },
  angry: { label: 'Escalation (bad AI answer)', weight: 0, priority: 'high' },
};

// Category weights given the current product state. bugHours: open bug hours; outage 0..1.
export function categoryWeights({ bugHours = 0, outage = 0, hasBilling = true }) {
  const w = Object.fromEntries(Object.entries(CATEGORIES).map(([k, c]) => [k, c.weight]));
  w.bug = bugHours > 0 ? Math.min(0.45, 0.08 + bugHours / 200) : 0.03;
  if (!hasBilling) w.billing = 0.03;
  w.outage = outage > 0 ? 2 * outage : 0;
  return w;
}

export function drawCategory(rand, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [k, v] of Object.entries(weights)) { r -= v; if (r <= 0) return k; }
  return 'howto';
}

// Deterministic 0..1 from a string (FNV), so offline variety never draws from rng(state).
const u01 = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10007) / 10007; };
const pickKey = (arr, key) => arr[Math.floor(u01(key) * arr.length) % arr.length];

// Offline tickets: several situations per category, phrased per writer, filled from the ticket's own facts (feature,
// open bug, plan amount, B2C vs B2B). The variant is hash-picked from the writer and topic. [design]
const TICKETS = {
  howto: [
    (x) => ({ subject: `How do I set up ${x.f}?`, body: `Hi, I'm trying to get ${x.f} working for ${x.our} and I'm stuck after connecting. What am I supposed to do next?` }),
    (x) => ({ subject: `${x.F}: where is the setting?`, body: `I can't find where to change how ${x.f} works. The help article shows a screen I don't have.` }),
    (x) => ({ subject: `Quick question about ${x.f}`, body: `Does ${x.f} pick up the old data too, or only things from today on? I don't want to redo last month by hand.` }),
    (x) => ({ subject: 'Getting started', body: `Signed up ${x.when}, but I'm not sure what to do first. ${x.b2c ? 'Is there a quick guide?' : 'Is there a checklist I can send to my team?'}` }),
  ],
  bug: [
    (x) => ({ subject: x.topic ? `${x.topic}` : `${x.F} isn't working`, body: `${x.topic ?? `${x.F} isn't working`}. Tried twice today. I need this working before Friday.` }),
    (x) => ({ subject: `Error in ${x.f}`, body: `${x.topic ? `${x.topic}: ` : ''}I get an error every time I try ${x.f}. Screenshot attached. Started ${x.when}.` }),
    (x) => ({ subject: 'Something broke after your update', body: `${x.f} worked fine last week. Since ${x.when} ${x.topic ? x.topic.toLowerCase() : 'it does nothing when I click it'}.` }),
  ],
  billing: [
    (x) => ({ subject: 'Invoice with our details', body: x.b2c ? `Can I get a receipt with my full name on it? I need it for my records.` : `Our accountant needs invoices with our company name and VAT/tax number. Where do I add those?` }),
    (x) => ({ subject: 'Refund for this month?', body: `I meant to cancel before the renewal and forgot. ${x.amount ? `Could you refund the ${x.amount}?` : 'Could you refund this month?'} I haven't used it since.` }),
    (x) => ({ subject: 'Charged twice?', body: `I see two charges from ${x.product} on my card this month. Can you check and refund the extra one?` }),
    (x) => ({ subject: 'Changing plans', body: `${x.b2c ? 'I' : 'We'} want to ${u01(x.key + 'up') < 0.5 ? 'upgrade' : 'downgrade'}. Will I be charged the difference right away or at renewal?` }),
    (x) => ({ subject: 'Card update', body: `My card was replaced and I think the payment failed. How do I update it without losing ${x.b2c ? 'my' : 'our'} data?` }),
  ],
  feature: [
    (x) => ({ subject: 'Feature request', body: `Any chance you can add ${x.topic ?? 'an export to CSV'}? Right now I copy things into a spreadsheet by hand.` }),
    (x) => ({ subject: `Request: ${x.topic ?? 'bulk edit'}`, body: `${x.F} is useful, but I need ${x.topic ? x.topic.toLowerCase() : 'a way to edit many items at once'}. Is that on the roadmap?` }),
    (x) => ({ subject: 'Would pay more for this', body: `If ${x.product} had ${x.topic ? x.topic.toLowerCase() : 'a weekly summary email'} I'd move ${x.b2c ? 'everything' : 'the rest of the team'} over.` }),
  ],
  account: [
    (x) => ({ subject: "Teammate can't get in", body: `My teammate never got the invite email and I can't find where to resend it.` }),
    (x) => ({ subject: "Can't log in", body: `The password reset email never arrives. I checked spam. ${x.b2c ? 'I use a Gmail address.' : 'We use Outlook at work.'}` }),
    (x) => ({ subject: 'Change account owner', body: `${x.b2c ? 'I changed my email address' : 'The person who set up our account left'}. How do I move the account over?` }),
  ],
  outage: [
    (x) => ({ subject: 'Is it down??', body: `Nothing loads since this morning. Are you aware? ${x.b2c ? 'I can\'t get in at all.' : 'We\'re blocked.'}` }),
    (x) => ({ subject: `${x.product} not loading`, body: `${x.topic ? `${x.topic}? ` : ''}Spinning forever on every page. Is there a status page?` }),
  ],
  angry: [
    (x) => ({ subject: 'Your bot gave me the wrong answer', body: `Your support bot told me to do something that made it worse. I want a human.` }),
    (x) => ({ subject: 'I need a person, not a bot', body: `Third time asking. The bot keeps sending me the same article and it doesn't apply to ${x.b2c ? 'me' : 'our account'}.` }),
  ],
};
export function fallbackTicket({ category, topic, name, product, feature, key = '', b2c = false, amount = null, daysAgo = null }) {
  const first = String(name ?? 'there').split(' ')[0];
  const f = feature ?? 'the main feature';
  const x = { f, F: f[0].toUpperCase() + f.slice(1), topic: topic ?? null, product, b2c, our: b2c ? 'my account' : 'our account', amount, key: `${name}|${category}|${topic ?? ''}|${key}`, when: daysAgo == null ? 'this week' : daysAgo <= 1 ? 'yesterday' : `${daysAgo} days ago` };
  const t = pickKey(TICKETS[category] ?? TICKETS.howto, x.key)(x);
  return { subject: t.subject, body: `${t.body} ${first}` };
}

export const TICKET_SCHEMA = { type: 'object', additionalProperties: false, required: ['subject', 'body'], properties: { subject: { type: 'string' }, body: { type: 'string' } } };
export const REPLY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'satisfied', 'solved'],
  properties: {
    reply: { type: 'string', description: 'Your answer to the support agent, 1-3 sentences' },
    satisfied: { type: 'number', description: '0-1: how well your problem was handled' },
    solved: { type: 'boolean', description: 'Is your problem actually solved now?' },
  },
};
export const REVIEW_SCHEMA = { type: 'object', additionalProperties: false, required: ['title', 'text'], properties: { title: { type: 'string' }, text: { type: 'string' } } };
export const ARTICLE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['quality', 'issues'],
  properties: { quality: { type: 'number', description: '0-1: would this article let a customer solve the problem without contacting support?' }, issues: { type: 'array', items: { type: 'string' } } },
};
export const RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['quality', 'note'],
  properties: { quality: { type: 'number', description: '0-1: how a prospect reading this public reply would judge the company' }, note: { type: 'string' } },
};

// Offline reviews: what the reviewer praises or complains about comes from what actually happened to customers
// (open bug hours, recent CSAT, shipped features), phrased in one of several voices picked by the review id.
// ctx: { key, b2c, bugHours, csat (0..1 or null), features: [titles] }. [design]
const REVIEW_TITLES = {
  5: ['Does one thing really well', 'Saves me real time', 'Exactly what I needed', 'Finally, no more spreadsheets'],
  4: ['Solid, a few gaps', 'Good, not perfect', 'Worth it, with caveats', 'Does the main job well'],
  3: ['OK but not there yet', 'Mixed feelings', 'Promising, still rough', 'Does part of the job'],
  2: ['Frustrating', 'Not worth it for us', 'Too many problems', 'Wanted to like it'],
  1: ['Avoid', 'Cancelled', 'Waste of money', 'Broke when we needed it'],
};
export function fallbackReview(rating, { product, feature, key = '', b2c = false, bugHours = 0, csat = null, features = [] } = {}) {
  const k = `${key}|${rating}|${product}`;
  const feats = features.length ? features : feature ? [feature] : [];
  const f = feats.length ? pickKey(feats, `${k}:f`) : 'the core workflow';
  const we = b2c ? 'I' : 'We', us = b2c ? 'me' : 'us', our = b2c ? 'my' : 'our';
  const buggy = bugHours > 25, slow = csat != null && csat < 0.65, fastSupport = csat != null && csat >= 0.85;
  const problem = buggy ? pickKey(['things break more often than they should', `${f} failed on ${us} twice in a month`, 'every update seems to break something'], `${k}:b`)
    : slow ? pickKey(['support takes days to answer', 'emails to support go unanswered for days', 'nobody answered when it mattered'], `${k}:s`)
      : pickKey([`it doesn't connect to the tools ${we.toLowerCase()} already use`, `${we.toLowerCase()} still do half the job by hand`, 'it is pricey for what it does'], `${k}:g`);
  const title = pickKey(REVIEW_TITLES[Math.max(1, Math.min(5, rating))], `${k}:t`);
  let text;
  if (rating >= 5) text = pickKey([`${we} use ${product} every week for ${f}. Setup took an afternoon.${fastSupport ? ' Support answered fast when we got stuck.' : ''}`, `${f} replaced a spreadsheet ${we.toLowerCase()} hated. It just works.${fastSupport ? ' Quick, human answers from support.' : ''}`, `Been on it a few months. ${f} saves ${us} a couple of hours a week${buggy ? ", even with the odd glitch" : " and nothing has broken"}.`], `${k}:x`);
  else if (rating === 4) text = `${f} saves ${us} time. ${problem[0].toUpperCase()}${problem.slice(1)}, but overall worth it.`;
  else if (rating === 3) text = `It works for the basics and ${f} is fine. But ${problem}, so ${we.toLowerCase()} still keep a spreadsheet on the side.`;
  else text = `${problem[0].toUpperCase()}${problem.slice(1)}. ${rating === 1 ? 'Cancelled.' : `Looking at alternatives for ${our} team.`.replace(' for my team', '')}`;
  return { title, text };
}
