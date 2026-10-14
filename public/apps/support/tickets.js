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

export function fallbackTicket({ category, topic, name, product, feature }) {
  const first = String(name ?? 'there').split(' ')[0];
  const f = feature ?? 'the main feature';
  return {
    howto: { subject: `How do I set up ${f}?`, body: `Hi, I'm trying to get ${f} working for our account and I'm stuck after connecting. What am I supposed to do next? ${first}` },
    bug: { subject: 'This is broken', body: `${topic ?? `${f} isn't working`}. Tried twice today. I need this working before Friday. ${first}` },
    billing: { subject: 'Charged twice?', body: `I see two charges from ${product} on my card this month. Can you check and refund the extra one? ${first}` },
    feature: { subject: 'Feature request', body: `Any chance you can add ${topic ?? 'an export to CSV'}? Right now I copy things into a spreadsheet by hand. ${first}` },
    account: { subject: "Can't log in", body: `My teammate never got the invite email and I can't find where to resend it. ${first}` },
    outage: { subject: 'Is it down??', body: `Nothing loads since this morning. Are you aware? We're blocked. ${first}` },
    angry: { subject: 'Your bot gave me the wrong answer', body: `Your support bot told me to do something that made it worse. I want a human. ${first}` },
  }[category];
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

export function fallbackReview(rating, { product, feature }) {
  if (rating >= 5) return { title: 'Does one thing really well', text: `We use ${product} every week for ${feature ?? 'the core workflow'}. Setup took an afternoon. Support answered fast when we got stuck.` };
  if (rating === 4) return { title: 'Solid, a few gaps', text: `${feature ?? 'The main feature'} saves us time. Missing a couple of integrations we need, and the occasional bug.` };
  if (rating === 3) return { title: 'OK but not there yet', text: `It works for the basics. We still do part of the job in spreadsheets, and a few things broke on us.` };
  return { title: 'Frustrating', text: `Bugs and slow answers from support. ${rating === 1 ? 'Cancelled.' : 'Looking at alternatives.'}` };
}
