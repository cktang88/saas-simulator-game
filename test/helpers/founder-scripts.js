// Scripted founders and interview targets for the persona evaluation (scripts/persona-eval.mjs).
//
// A founder script is a fixed sequence of questions. Operator quality shows in WHAT is asked (past behaviour vs
// hypotheticals, follow-ups, current spend, commitment asks, referral asks), never in volume or keywords.
// Every step carries a `kind`; the evaluator uses it to know what the step asked for (money? commitment?) without
// trusting the persona module's own classifier. `variants` are paraphrases for wording-sensitivity probes.
//
// Kinds: open_context, past_incident, followup_workaround, followup_cost, current_spend, commit_money,
// commit_time, referral, leading, hypothetical_use, wtp_hypothetical, feature_wishlist, pitch, opinion.

export const MONEY_KINDS = new Set(['followup_cost', 'current_spend', 'commit_money', 'wtp_hypothetical']);
export const COMMIT_KINDS = new Set(['commit_money', 'commit_time']);

export const DEFAULT_CTX = {
  task: 'getting paid by clients (invoicing and chasing late payments)',
  problem: 'a client paying late or an invoice slipping through',
  product: 'tool that automates invoice follow-ups',
  price: 49,
};

const fill = (s, ctx) => s.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? `{${k}}`);

export const FOUNDERS = {
  // Past-specific, follow-ups, current spend, asks for a costly commitment, asks who else to talk to.
  stellar: {
    id: 'stellar',
    label: 'Stellar (Mom Test)',
    steps: [
      { kind: 'open_context', q: 'Walk me through how {task} works for you today, start to finish.' },
      { kind: 'past_incident', q: 'Tell me about the last time {problem}. What actually happened?',
        variants: ['When did {problem} last happen to you? Take me through that one specific time.', 'Think of the most recent time {problem}. What happened, step by step?'] },
      { kind: 'followup_workaround', q: 'What did you do about it? Walk me through the steps you took.',
        variants: ['And how did you deal with it in the moment?', 'What did you end up doing to fix it?'] },
      { kind: 'followup_cost', q: 'What did that cost you last month, in hours or dollars?',
        variants: ['Roughly how much time and money did that eat up in the last month?', 'Can you put a number on what handling that costs you per month?'] },
      { kind: 'current_spend', q: 'What are you paying for today to handle this: tools, people, anything?',
        variants: ['What do you spend on this right now, on software or someone\'s time?', 'Which tools or people do you pay for to cope with this today?'] },
      { kind: 'commit_money', q: 'I can have a pilot ready in four weeks at ${price} a month. Would you pre-pay the first three months to get a seat, with a refund if I miss the date?' },
      { kind: 'commit_time', q: 'Can I come back next Thursday with a prototype for 30 minutes, with whoever signs off on this?' },
      { kind: 'referral', q: 'Who else deals with this, and who would have to approve a purchase? Could you introduce me?' },
    ],
  },
  // Some good past questions, but leading and hypothetical ones mixed in, no real commitment ask.
  average: {
    id: 'average',
    label: 'Average (mixed)',
    steps: [
      { kind: 'open_context', q: 'Tell me a bit about how you handle {task}.' },
      { kind: 'leading', q: 'I imagine {problem} is really frustrating, isn\'t it?' },
      { kind: 'past_incident', q: 'Has {problem} happened to you recently?' },
      { kind: 'wtp_hypothetical', q: 'How much would you pay for a tool that fixed that?' },
      { kind: 'hypothetical_use', q: 'If we built a {product}, do you think you would use it?' },
      { kind: 'commit_time', q: 'Mind if I follow up with you sometime?' },
    ],
  },
  // Pitches, "would you use", feature wishlists, leading questions.
  mediocre: {
    id: 'mediocre',
    label: 'Mediocre (pitcher)',
    steps: [
      { kind: 'pitch', q: 'I\'m building a {product}. It sends smart reminders, tracks payments and uses AI to predict late payers. Pretty cool, right?' },
      { kind: 'hypothetical_use', q: 'Would you use something like that?' },
      { kind: 'leading', q: 'Wouldn\'t it be great if late invoices just solved themselves?' },
      { kind: 'feature_wishlist', q: 'What features would you want in it?' },
      { kind: 'wtp_hypothetical', q: 'Would you pay ${price} a month for it?' },
      { kind: 'opinion', q: 'Do you think it\'s a good idea?' },
      { kind: 'commit_money', q: 'So can I put you down as a customer?' },
    ],
  },
  // Same shape as mediocre, but every question is loaded with the words a naive keyword gate would reward
  // ("last time", "specifically", "how much", "workaround") while still being hypothetical, leading or a pitch.
  keyword_stuffer: {
    id: 'keyword_stuffer',
    label: 'Keyword stuffer',
    steps: [
      { kind: 'pitch', q: 'Last time, specifically, in the past, an AI-native workflow synergy like our {product} would hypothetically solve {problem}, right?' },
      { kind: 'hypothetical_use', q: 'Last time you struggled, hypothetically, what workaround would you use if our {product} existed? Would you use it?' },
      { kind: 'leading', q: 'Specifically last time, wouldn\'t you love to save money and hours on that pain point, your biggest problem?' },
      { kind: 'wtp_hypothetical', q: 'In the past, how much did it cost you, so hypothetically how much would you pay per month, ${price}?' },
      { kind: 'feature_wishlist', q: 'Last time you needed something, specifically which workflow features would you want? Tell me about a time you wanted them.' },
      { kind: 'commit_money', q: 'Given all that pain, last time and every time, can I count you in?' },
    ],
  },
};

// Interview targets. `segment`: 'best' (hair-on-fire niche), 'weak' (lowest pain prevalence), 'outsider' (not in any
// segment) or 'idiosyncratic' (the segment with the highest idiosyncrasy). `relationship` is what the draw should
// produce; the evaluator rejection-samples drawPerson on it. `buyerOnly`: keep only people with budget authority.
export const TARGETS = {
  right_stranger: { id: 'right_stranger', label: 'Right segment, stranger', segment: 'best', channel: 'community', relationship: 'stranger' },
  wrong_segment: { id: 'wrong_segment', label: 'Wrong segment, stranger', segment: 'weak', channel: 'community', relationship: 'stranger' },
  outsider: { id: 'outsider', label: 'Outsider (no segment)', segment: 'outsider', channel: 'cold', relationship: 'stranger' },
  friend: { id: 'friend', label: 'Friends and family', segment: 'best', channel: 'warm', relationship: 'friend' },
  warm: { id: 'warm', label: 'Warm intro', segment: 'best', channel: 'warm', relationship: 'warm' },
  investor: { id: 'investor', label: 'Investor', segment: 'outsider', channel: 'warm', relationship: 'investor' },
  founder: { id: 'founder', label: 'Fellow founder', segment: 'outsider', channel: 'community', relationship: 'founder' },
  big_customer: { id: 'big_customer', label: 'Big idiosyncratic customer', segment: 'idiosyncratic', channel: 'warm', relationship: 'stranger', idiosyncratic: true },
};

/** Render a founder's steps with the idea context filled in. Optionally pick variant `v` (0 = base wording). */
export function renderScript(founderId, ctx = {}, v = 0) {
  const c = { ...DEFAULT_CTX, ...ctx };
  const f = FOUNDERS[founderId];
  if (!f) throw new Error(`unknown founder script ${founderId}`);
  return f.steps.map((s) => ({ kind: s.kind, q: fill(v > 0 && s.variants?.[v - 1] ? s.variants[v - 1] : s.q, c) }));
}

export const founderIds = () => Object.keys(FOUNDERS);
export const targetIds = () => Object.keys(TARGETS);
