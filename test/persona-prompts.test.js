// Persona prompts / offline answers / reply validation (public/data/persona-prompts.js). Pure and fast; fabricated people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  intervieweeSystemPrompt, prospectSystemPrompt, REPLY_SCHEMA, HIDDEN_STATE_SCHEMA, validateReply, offlineAnswer,
  classifyQuestion, detectAsk, inflatedWtp, maxCommitment, INTERVIEWEE_BEHAVIOUR, PROSPECT_BEHAVIOUR, FEW_SHOTS,
  FACT_KEYS, COMMITMENT_ORDER, QUESTION_TYPES, newHiddenState, advanceState, relationshipGroup,
} from '../public/data/persona-prompts.js';

const person = (o = {}) => ({
  segmentId: 'ops-agencies', role: 'operations lead at a 12-person agency', isBuyer: true, budgetAuthority: true,
  hasPain: true, painIntensity: 0.8, frequency: 'weekly',
  lastIncident: 'The month-end invoices went out with the wrong rates and we ate a refund',
  workaround: 'a shared spreadsheet plus reminder emails', workaroundCostMonthly: 240, wtpTrue: 137, statedWtpMult: 1.5,
  politeness: 0.25, idiosyncraticAsk: null, jobsRanked: [{ id: 'j1', label: 'get invoices right the first time' }],
  competingPriorities: ['the annual renewal', 'hiring a designer'], relationship: 'stranger', ...o,
});
const stranger = (o) => person(o);
const friend = (o) => person({ relationship: 'friend', politeness: 0.85, ...o });
const nopain = (o) => person({ hasPain: false, painIntensity: 0.05, workaroundCostMonthly: 0, wtpTrue: 0, ...o });
const seqRand = (seed = 1) => { let x = (seed * 7919 + 104729) % 2147483647; const next = () => { x = (x * 48271) % 2147483647; return (x - 1) / 2147483646; }; next(); next(); next(); return next; };
const PAST = 'Walk me through the last time the invoices went wrong. What happened?';
const HYP = 'Would you use a tool that fixes invoices automatically?';
const PITCH = "We're building an invoicing assistant that checks every rate automatically.";
const LEAD = "Wouldn't it be great if invoices just fixed themselves?";
const STACK = 'How do you handle invoices and what tools do you use and how much do you spend and who approves it?';
const PRICE_H = 'How much would you pay per month for something that solves this?';
const PRICE_C = 'What do you pay for this today?';
const FEAT = 'What features would you want in something like this?';
const TALK = 'Hi, thanks for making the time!';

test('classifier handles 25+ paraphrases', () => {
  const cases = [
    ['Tell me about the last time the reports broke.', 'past_specific'],
    ['Can you walk me through what happened the last time a client invoice was wrong?', 'past_specific'],
    ['Could you take me through your most recent month-end close?', 'past_specific'],
    ['How do you currently handle approvals?', 'past_specific'],
    ['What have you tried so far to fix this?', 'past_specific'],
    ['Who else is involved when you sign off on a new tool?', 'past_specific'],
    ['Think back to the last incident. What did you do next?', 'past_specific'],
    ['You mentioned the spreadsheet. Tell me more about that.', 'open_followup'],
    ['Why is that?', 'open_followup'],
    ['And then what happened?', 'open_followup'],
    ['Wouldn\'t it be great if this just worked?', 'leading'],
    ["That must be so frustrating, right?", 'leading'],
    ["Don't you think invoicing is a nightmare?", 'leading'],
    ['Would you use an app that did this for you?', 'hypothetical'],
    ['If we built a dashboard for this, would you try it?', 'hypothetical'],
    ['Imagine you had a tool that closed the books for you. Would that help?', 'hypothetical'],
    ['Could you see yourself using something like that?', 'hypothetical'],
    ["We're building a tool that auto-checks rates before invoices go out.", 'pitch'],
    ['Let me show you our demo, it lets you fix invoices in one click.', 'pitch'],
    ['What do you think of my idea for an invoicing assistant?', 'pitch'],
    ['How much would you pay for that?', 'price_hypothetical'],
    ['What price point feels fair to you?', 'price_hypothetical'],
    ['Would you pay $50 a month for it?', 'price_hypothetical'],
    ['What do you pay for this today?', 'price_current'],
    ['How much did that incident cost you?', 'price_current'],
    ['What are you spending on that tooling right now?', 'price_current'],
    ['What features would you want in it?', 'feature_request'],
    ['What is missing from what you use today?', 'feature_request'],
    ['How do you handle invoices, what tools do you use, and who approves them? Also how much do you pay?', 'stacked'],
    ['Hi, thanks so much for making time today.', 'small_talk'],
    ['Do you usually have problems with invoices?', 'generic'],
    ['In general, how is the invoicing process going?', 'generic'],
  ];
  assert.ok(cases.length >= 20);
  for (const [q, want] of cases) assert.equal(classifyQuestion(q), want, q);
  // Every returned label is a declared type.
  for (const [q] of cases) assert.ok(QUESTION_TYPES.includes(classifyQuestion(q)));
});

test('classifier: keyword-stuffed hypotheticals and pitches stay hypothetical/pitch; stuffing earns nothing', () => {
  assert.equal(classifyQuestion('Last time, walk me through what happened, would you use a tool that fixed it?'), 'hypothetical');
  assert.equal(classifyQuestion('Tell me about the last time you would use a fix, and what happened?'), 'hypothetical');
  assert.equal(classifyQuestion("What happened the last time? Anyway we're building an app that fixes this."), 'pitch');
  assert.equal(classifyQuestion("Wouldn't it be great if, the last time it happened, it fixed itself?"), 'leading');
  assert.equal(classifyQuestion('last time last time last time pain point workflow synergy last time what happened'), 'generic');
  assert.equal(classifyQuestion('AI-native workflow synergy pain point'), 'generic');
  // "you mentioned" with no prior reply is not a follow-up.
  assert.equal(classifyQuestion('You mentioned the spreadsheet, tell me more.', []), 'generic');
  assert.equal(classifyQuestion('You mentioned the spreadsheet, tell me more.', [{ from: 'them', text: 'We use a spreadsheet.' }]), 'open_followup');
  // Echoing their last words is a follow-up even without a marker phrase.
  assert.equal(classifyQuestion('What went wrong with the spreadsheet reminders?', [{ from: 'them', text: 'We use a spreadsheet and reminders.' }]), 'past_specific');
  assert.equal(classifyQuestion('How does the spreadsheet reminders part work?', [{ from: 'them', text: 'We use a spreadsheet and reminders.' }]), 'open_followup');
});

test('detectAsk finds the strongest commitment requested', () => {
  assert.equal(detectAsk('Would you put down a $50 deposit?'), 'deposit');
  assert.equal(detectAsk('Can you pre-order today?'), 'preorder');
  assert.equal(detectAsk('Could we sign a letter of intent?'), 'loi');
  assert.equal(detectAsk('Would you pilot it for a month?'), 'pilot');
  assert.equal(detectAsk('Could you introduce me to your cofounder?'), 'intro');
  assert.equal(detectAsk('Can we set up a follow-up next week?'), 'followup');
  assert.equal(detectAsk(PAST), null);
});

test('offline answers reveal facts only for earned questions', () => {
  const p = stranger();
  for (const q of [HYP, PITCH, LEAD, STACK, PRICE_H, FEAT, TALK, 'Do you usually have problems with invoices?',
    'Last time, walk me through what happened, would you use a tool that fixed it?']) {
    const a = offlineAnswer(p, q, [], seqRand(3));
    assert.deepEqual(a.revealed, [], q);
    assert.equal(a.commitment, 'none');
    assert.ok(!a.reply.includes('wrong rates'), q);
    assert.deepEqual(a.flags, [], q);
  }
  const a = offlineAnswer(p, PAST, [], seqRand(3));
  assert.deepEqual(a.revealed, ['lastIncident']);
  assert.match(a.reply, /wrong rates/);
  // The follow-up on the workaround reveals exactly one new fact, and a repeat is called out.
  const h = [{ from: 'me', text: PAST }, { from: 'them', text: a.reply, revealed: a.revealed }];
  const b = offlineAnswer(p, 'What do you use today to handle it?', h, seqRand(5));
  assert.deepEqual(b.revealed, ['workaround']);
  assert.match(b.reply, /spreadsheet/);
  const c = offlineAnswer(p, PAST, h, seqRand(5));
  assert.deepEqual(c.revealed, []);
  assert.match(c.reply, /already|Like I said|same|covered/i);
});

test('no-pain people never give an incident, never commit money, and never invent a problem', () => {
  const rels = [nopain(), nopain({ relationship: 'friend', politeness: 0.85 }), nopain({ relationship: 'warm', politeness: 0.6 })];
  const asks = ['Would you put down a deposit?', 'Can you pre-order today?', 'Would you sign a letter of intent?', 'Would you run a pilot with us?', 'Can you introduce me to someone?', 'Can we do a follow-up call?'];
  for (const p of rels) for (const q of asks) for (let s = 1; s < 8; s++) {
    const a = offlineAnswer(p, q, [{ from: 'me', text: PAST }, { from: 'them', text: 'x', revealed: ['workaround', 'frequency', 'decision'] }], seqRand(s));
    assert.ok(['none', 'followup', 'intro'].includes(a.commitment), `${q} -> ${a.commitment}`);
    assert.ok(!['pilot', 'loi', 'preorder', 'deposit'].includes(a.commitment));
  }
  const a = offlineAnswer(nopain(), PAST, [], seqRand(2));
  assert.deepEqual(a.revealed, []);
  assert.match(a.reply, /can't|nothing|don't|not that/i);
  assert.equal(maxCommitment(nopain(), { earned: 6 }), 'followup');
  assert.equal(maxCommitment(nopain({ relationship: 'friend', politeness: 0.9 }), { earned: 6 }), 'intro');
});

test('commitment ceilings follow the hidden facts', () => {
  assert.equal(maxCommitment(person(), { earned: 0 }), 'followup');
  assert.equal(maxCommitment(person(), { earned: 2 }), 'pilot');
  assert.equal(maxCommitment(person(), { earned: 3, price: 99 }), 'deposit');
  assert.equal(maxCommitment(person(), { earned: 3, price: 400 }), 'loi', 'preorder needs wtpTrue >= price');
  assert.equal(maxCommitment(person({ budgetAuthority: false }), { earned: 5 }), 'pilot', 'champions cannot sign');
  assert.equal(maxCommitment(person({ relationship: 'investor', hasPain: false }), { earned: 5 }), 'intro');
  assert.equal(maxCommitment(person({ painIntensity: 0.3 }), { earned: 5 }), 'intro');
});

test('earned pain with authority can commit; the same ask from a non-buyer is downgraded', () => {
  const h = [
    { from: 'me', text: PAST }, { from: 'them', text: 'a', revealed: ['lastIncident'] },
    { from: 'me', text: 'What do you use today?' }, { from: 'them', text: 'b', revealed: ['workaround'] },
    { from: 'me', text: 'What do you pay for it today?' }, { from: 'them', text: 'c', revealed: ['spend'] },
  ];
  const buyer = offlineAnswer(person(), 'Would you put down a deposit to reserve a spot?', h, seqRand(4), { price: 99 });
  assert.equal(buyer.commitment, 'deposit');
  const champ = offlineAnswer(person({ budgetAuthority: false }), 'Would you put down a deposit to reserve a spot?', h, seqRand(4), { price: 99 });
  assert.equal(champ.commitment, 'pilot');
  assert.match(champ.reply, /not ready|bit much|can't promise|not that/i);
  const cold = offlineAnswer(person(), 'Would you put down a deposit to reserve a spot?', [], seqRand(4), { price: 99 });
  assert.equal(cold.commitment, 'followup', 'no earned facts yet: only a polite follow-up');
});

test('friends praise more than strangers', () => {
  const praise = /love|great|amazing|awesome|totally|definitely|proud|crush|100%|first in line|count me in|for sure|of course/i;
  const count = (mk) => {
    let n = 0;
    for (let s = 1; s <= 24; s++) for (const q of [PITCH, HYP, LEAD, FEAT]) if (praise.test(offlineAnswer(mk(), q, [], seqRand(s)).reply)) n++;
    return n;
  };
  for (const mk of [nopain, person]) {
    const f = count(() => ({ ...mk(), relationship: 'friend', politeness: 0.85 }));
    const st = count(() => ({ ...mk(), relationship: 'stranger', politeness: 0.25 }));
    assert.ok(f >= st * 2 && f >= 20, `friends ${f} vs strangers ${st}`);
  }
  // A no-pain stranger is indifferent, not enthusiastic.
  const a = offlineAnswer(nopain(), PITCH, [], seqRand(1));
  assert.equal(a.sentiment, 'neutral');
  assert.equal(relationshipGroup(friend()), 'close');
  assert.equal(relationshipGroup(stranger()), 'stranger');
  assert.equal(relationshipGroup(person({ relationship: 'investor' })), 'advisor');
});

test('hypothetical WTP is inflated versus the true current spend', () => {
  const people = [];
  for (let i = 0; i < 12; i++) { const base = 90 + i * 25; people.push(person({ wtpTrue: base, workaroundCostMonthly: base, statedWtpMult: 1.15 + (i % 6) * 0.25 })); }
  let hyp = 0; let cur = 0; const num = (r) => Number(/\$([\d,]+)/.exec(r)[1].replace(/,/g, ''));
  for (const p of people) {
    const a = offlineAnswer(p, PRICE_H, [], seqRand(2));
    const b = offlineAnswer(p, PRICE_C, [], seqRand(2));
    assert.equal(a.statedWtp, inflatedWtp(p));
    assert.ok(a.statedWtp > p.wtpTrue, 'inflated');
    assert.equal(b.statedWtp, null);
    assert.deepEqual(b.revealed, ['spend']);
    hyp += num(a.reply); cur += num(b.reply);
    assert.equal(num(b.reply), p.workaroundCostMonthly, 'current spend is the true number');
  }
  assert.ok(hyp / 12 > (cur / 12) * 1.1, `hyp ${hyp / 12} vs current ${cur / 12}`);
});

test('non-buyers defer budget; investors and founders give opinions, not their own pain', () => {
  const nb = person({ isBuyer: false, budgetAuthority: false });
  const a = offlineAnswer(nb, PRICE_H, [], seqRand(1));
  assert.equal(a.statedWtp, null);
  assert.match(a.reply, /boss|budget|signs|above|pay/i);
  assert.ok(!/\$\d/.test(a.reply));
  const b = offlineAnswer(nb, PRICE_C, [], seqRand(1));
  assert.deepEqual(b.revealed, []);
  assert.ok(!/\$\d/.test(b.reply));
  for (const rel of ['investor', 'founder']) {
    const inv = person({ relationship: rel, hasPain: false, isBuyer: false, budgetAuthority: false, politeness: 0.4, wtpTrue: 0, workaroundCostMonthly: 0 });
    for (const q of [PAST, PRICE_C, PRICE_H, PITCH, FEAT]) {
      const r = offlineAnswer(inv, q, [], seqRand(6));
      assert.deepEqual(r.revealed, [], q);
      assert.equal(r.statedWtp, null);
      assert.ok(!/wrong rates|spreadsheet/.test(r.reply));
    }
    assert.match(offlineAnswer(inv, PITCH, [], seqRand(1)).reply, /idea|market|customer|distribution|crowded|narrow|pay/i);
  }
});

test('an idiosyncratic ask appears for that person only', () => {
  const ask = 'a custom SAP export with our cost-center codes';
  const loud = person({ idiosyncraticAsk: ask });
  const plain = person({ idiosyncraticAsk: null });
  const a = offlineAnswer(loud, FEAT, [], seqRand(1));
  assert.deepEqual(a.revealed, ['idiosyncraticAsk']);
  assert.match(a.reply, /SAP export/);
  assert.match(a.reply, /sign|in|everything else|matters|need/i);
  const again = offlineAnswer(loud, FEAT, [{ from: 'me', text: 'x' }, { from: 'them', text: a.reply, revealed: a.revealed }], seqRand(1));
  assert.deepEqual(again.revealed, []);
  // The other person never says it, across every question type and several seeds.
  const qs = [PAST, HYP, PITCH, LEAD, STACK, PRICE_H, PRICE_C, FEAT, TALK, 'Would you pilot it?'];
  for (const q of qs) for (let s = 1; s < 6; s++) {
    const r = offlineAnswer(plain, q, [], seqRand(s));
    assert.ok(!/SAP/.test(r.reply));
    assert.ok(!r.revealed.includes('idiosyncraticAsk'));
  }
  // A person with no pain does not push a custom ask either.
  assert.deepEqual(offlineAnswer(nopain({ idiosyncraticAsk: ask }), FEAT, [], seqRand(1)).revealed, []);
  // The prompt marks it as personal.
  assert.match(intervieweeSystemPrompt(loud), /SAP export/);
  assert.ok(!/SAP export/.test(intervieweeSystemPrompt(plain)));
});

test('offline variety: at least 4 distinct phrasings per type x pain x relationship', () => {
  const Q = { past_specific: PAST, hypothetical: HYP, leading: LEAD, pitch: PITCH, price_hypothetical: PRICE_H, price_current: PRICE_C, feature_request: FEAT, stacked: STACK, small_talk: TALK, generic: 'Do you usually have problems with invoices?' };
  const rels = { friend: { relationship: 'friend', politeness: 0.85 }, stranger: { relationship: 'stranger', politeness: 0.25 }, investor: { relationship: 'investor', politeness: 0.4, isBuyer: false, budgetAuthority: false } };
  for (const [type, q] of Object.entries(Q)) {
    assert.equal(classifyQuestion(q), type, `${type} sample is classified as itself`);
    for (const [rel, o] of Object.entries(rels)) for (const pain of [true, false]) {
      const p = pain ? person(o) : nopain(o);
      const seen = new Set();
      for (let s = 1; s <= 80; s++) seen.add(offlineAnswer(p, q, [], seqRand(s)).reply);
      // factual replies embed the person's own text, so variants are phrasings of that fact; still >= 4 wordings.
      assert.ok(seen.size >= 4, `${type}/${rel}/${pain ? 'pain' : 'none'}: ${seen.size}`);
    }
  }
});

test('offline replies are deterministic, short, and pass their own validator unchanged', () => {
  const p = person({ idiosyncraticAsk: 'a custom SAP export' });
  for (const q of [PAST, HYP, PITCH, LEAD, STACK, PRICE_H, PRICE_C, FEAT, TALK, 'Would you pilot it?']) {
    const a = offlineAnswer(p, q, [], seqRand(9));
    const b = offlineAnswer(p, q, [], seqRand(9));
    assert.deepEqual(a, b);
    assert.deepEqual(a.flags, [], q);
    assert.ok(a.reply.split(/[.!?]+\s/).length <= 5, a.reply);
    assert.ok(a.revealed.length <= 1);
  }
});

test('validateReply clamps illegal commitments', () => {
  const ask = [{ from: 'me', text: 'Would you put down a deposit to reserve a spot?' }];
  const bad = { reply: "Sure, here's my deposit.", revealed: [], commitment: 'deposit', statedWtp: null, sentiment: 'positive' };
  assert.equal(validateReply(nopain(), bad, ask).commitment, 'followup');
  assert.ok(validateReply(nopain(), bad, ask).flags.includes('commitment_clamped'));
  assert.ok(['none', 'followup', 'intro', 'pilot'].includes(validateReply(person({ budgetAuthority: false }), bad, ask).commitment));
  assert.ok(!['loi', 'preorder', 'deposit'].includes(validateReply(person({ budgetAuthority: false }), bad, [...ask]).commitment));
  // Preorder needs wtpTrue >= price.
  const pre = [{ from: 'me', text: 'Would you pre-order at the launch price?' }, { from: 'them', text: 'a', revealed: ['lastIncident', 'workaround', 'spend'] }, { from: 'me', text: 'Can you pre-order today?' }];
  const r = { reply: 'Yes.', revealed: [], commitment: 'preorder', statedWtp: null, sentiment: 'positive' };
  assert.equal(validateReply(person(), r, pre, { price: 99 }).commitment, 'preorder');
  assert.notEqual(validateReply(person(), r, pre, { price: 500 }).commitment, 'preorder');
  // Never above what was asked, never when nothing was asked.
  assert.equal(validateReply(person(), { ...r, commitment: 'pilot' }, [{ from: 'me', text: PAST }]).commitment, 'none');
  assert.equal(validateReply(person(), { ...r, commitment: 'loi' }, [{ from: 'me', text: 'Can we do a follow-up call?' }]).commitment, 'followup');
  // Investors never commit money.
  assert.ok(['none', 'followup', 'intro'].includes(validateReply(person({ relationship: 'investor' }), bad, ask).commitment));
});

test('validateReply caps reveals at one, drops unearned and repeated ones', () => {
  const q = [{ from: 'me', text: PAST }];
  const many = { reply: 'It happened last month and we use a sheet.', revealed: ['lastIncident', 'workaround', 'spend'], commitment: 'none', statedWtp: null, sentiment: 'positive' };
  const v = validateReply(person(), many, q);
  assert.deepEqual(v.revealed, ['lastIncident']);
  assert.ok(v.flags.includes('revealed_cap'));
  const hypo = validateReply(person(), many, [{ from: 'me', text: HYP }]);
  assert.deepEqual(hypo.revealed, []);
  assert.ok(hypo.flags.includes('unearned_reveal'));
  const rep = validateReply(person(), { ...many, revealed: ['lastIncident'] }, [{ from: 'me', text: 'x' }, { from: 'them', text: 'y', revealed: ['lastIncident'] }, { from: 'me', text: PAST }]);
  assert.deepEqual(rep.revealed, []);
  assert.deepEqual(validateReply(nopain(), { ...many, revealed: ['lastIncident'] }, q).revealed, [], 'no incident without pain');
  assert.deepEqual(validateReply(person(), { ...many, revealed: ['bogus'] }, q).revealed, []);
});

test('validateReply strips leaked hidden numbers and forces inflated stated WTP', () => {
  const p = person();
  const none = { revealed: [], commitment: 'none', statedWtp: null, sentiment: 'neutral' };
  // wtpTrue (137) and the current spend (240) were never asked for in this hypothetical turn.
  const leak = validateReply(p, { ...none, reply: 'Honestly I would pay $137 a month, and we spend $240 today.' }, [{ from: 'me', text: HYP }]);
  assert.ok(!/137|240/.test(leak.reply), leak.reply);
  assert.ok(leak.flags.some((f) => f.startsWith('leak:')));
  // Bare and k-formatted values too.
  assert.ok(!/137/.test(validateReply(p, { ...none, reply: 'It is worth 137 to me.' }, [{ from: 'me', text: HYP }]).reply));
  assert.ok(!/2,?880|2\.88k/.test(validateReply(p, { ...none, reply: 'We pay 2,880 a year.' }, [{ from: 'me', text: HYP }]).reply));
  // Current spend is allowed when asked what they pay today.
  const cur = validateReply(p, { ...none, reply: 'About $240 a month.', revealed: ['spend'] }, [{ from: 'me', text: PRICE_C }]);
  assert.match(cur.reply, /\$240/);
  assert.deepEqual(cur.flags, []);
  // Hypothetical price: forced to wtpTrue x mult, and the model's low figure is rewritten.
  const hyp = validateReply(p, { ...none, reply: 'I would pay $90 a month.', statedWtp: 90 }, [{ from: 'me', text: PRICE_H }]);
  assert.equal(hyp.statedWtp, inflatedWtp(p));
  assert.equal(hyp.statedWtp, 210);
  assert.match(hyp.reply, /\$210/);
  assert.ok(hyp.flags.includes('stated_wtp_forced'));
  // A figure the founder named is not a leak.
  const echo = validateReply(p, { ...none, reply: 'Is $137 the price? Hmm.' }, [{ from: 'me', text: "We're building it and it will cost $137 a month." }]);
  assert.match(echo.reply, /\$137/);
  // Non-buyers cannot name a price; a stated number on a non-price turn is nulled.
  const nb = validateReply(person({ budgetAuthority: false }), { ...none, reply: 'Maybe $50.', statedWtp: 50 }, [{ from: 'me', text: PRICE_H }]);
  assert.equal(nb.statedWtp, null);
  assert.ok(!/\$50/.test(nb.reply));
  assert.equal(validateReply(p, { ...none, statedWtp: 100, reply: 'ok' }, [{ from: 'me', text: PAST }]).statedWtp, null);
  // A narrated hidden record is replaced with a deflection.
  const narr = validateReply(p, { ...none, reply: 'Well the month-end invoices went out with the wrong rates and we ate a refund.' }, [{ from: 'me', text: HYP }]);
  assert.ok(narr.flags.includes('text_leak:lastIncident'));
  assert.ok(!/wrong rates/.test(narr.reply));
  // Illegal enum values fall back to safe defaults.
  const sane = validateReply(p, { reply: 'hi', commitment: 'wire-money', sentiment: 'ecstatic', revealed: 'x' }, []);
  assert.equal(sane.commitment, 'none');
  assert.equal(sane.sentiment, 'neutral');
});

test('prompts: all behavioural rules, no hidden wtpTrue, few-shots, product and disclosure handling', () => {
  const p = person({ idiosyncraticAsk: 'a custom SAP export', jobsRanked: ['get invoices right', 'cut chasing time'] });
  const prompt = intervieweeSystemPrompt(p, { productKnown: false, disclosed: ['lastIncident'] });
  for (const r of INTERVIEWEE_BEHAVIOUR) assert.ok(prompt.includes(r.text), r.id);
  assert.ok(INTERVIEWEE_BEHAVIOUR.length >= 12);
  assert.ok(FEW_SHOTS.length >= 3 && FEW_SHOTS.length <= 5);
  for (const s of FEW_SHOTS) assert.ok(prompt.includes(s.a));
  // wtpTrue (137) is never in the prompt; the inflated figure to say out loud (210) is, only for hypothetical price.
  assert.ok(!/\b137\b/.test(prompt));
  assert.ok(!/wtpTrue|statedWtpMult/.test(prompt));
  assert.match(prompt, /\$210 a month/);
  assert.match(prompt, /ONLY if the founder asks what you pay/);
  assert.match(prompt, /Already told the founder.*lastIncident/);
  assert.match(prompt, /has NOT yet said what they are building/);
  assert.match(intervieweeSystemPrompt(p, { productKnown: 'an invoice checker' }), /an invoice checker/);
  assert.match(prompt, /reveal at most ONE|at most ONE fact/i);
  assert.match(prompt, /AI|skeptical, busy/);
  for (const k of ['reply', 'revealed', 'commitment', 'statedWtp', 'sentiment']) assert.ok(prompt.includes(k));
  // Variation by relationship and pain.
  assert.match(intervieweeSystemPrompt(friend()), /generous with praise/);
  assert.match(intervieweeSystemPrompt(stranger()), /guarded/);
  assert.match(intervieweeSystemPrompt(person({ relationship: 'investor', hasPain: false })), /do not have this problem yourself/);
  const np = intervieweeSystemPrompt(nopain());
  assert.match(np, /NOT a real, current problem/);
  assert.ok(!/Last incident/.test(np));
  assert.match(intervieweeSystemPrompt(person({ budgetAuthority: false, isBuyer: false })), /NOT the buyer/);
  // Prompts never present wtpTrue as an instruction for any seed-like value.
  for (const wtp of [137, 88, 412]) assert.ok(!new RegExp(`\\$${wtp}\\b`).test(intervieweeSystemPrompt(person({ wtpTrue: wtp, statedWtpMult: 1.5, workaroundCostMonthly: 33 }))));
});

test('prospect prompt: budget earned, champions cannot sign, channel rules, grounded in the record', () => {
  const ctx = { seller: { name: 'Sam Seller', company: 'Acme' }, product: { oneLiner: 'an invoice checker' }, price: 99, channel: 'cold_email', company: { name: 'Northwind Studio' }, siteExcerpt: 'We are a design agency.', competitionBrief: 'They use ToolA.', reaction: 'You are mildly curious but skeptical.' };
  const pr = prospectSystemPrompt(person({ budgetAuthority: false, isBuyer: false, name: 'Pat Doe' }), ctx);
  for (const r of PROSPECT_BEHAVIOUR) assert.ok(pr.includes(r.text), r.id);
  assert.match(pr, /three good questions/);
  assert.match(pr, /cannot sign/);
  assert.match(pr, /under 70 words/);
  assert.match(pr, /\$99\/month/);
  assert.match(pr, /ToolA/);
  assert.match(pr, /Northwind Studio/);
  assert.ok(!/\b137\b/.test(pr));
  assert.match(prospectSystemPrompt(person(), { ...ctx, channel: 'call' }), /1-3 spoken sentences/);
  assert.match(prospectSystemPrompt(person(), { ...ctx, channel: 'linkedin' }), /under 50 words/);
  assert.match(prospectSystemPrompt(nopain(), ctx), /NOT a real, current problem/);
  assert.match(prospectSystemPrompt(person(), { channel: 'cold_email' }), /No price has been stated/);
});

test('schemas and hidden state', () => {
  assert.deepEqual(REPLY_SCHEMA.required, ['reply', 'revealed', 'commitment', 'statedWtp', 'sentiment']);
  assert.deepEqual(REPLY_SCHEMA.properties.commitment.enum, ['none', 'followup', 'intro', 'pilot', 'loi', 'preorder', 'deposit']);
  assert.equal(REPLY_SCHEMA.properties.revealed.maxItems, 1);
  assert.deepEqual(REPLY_SCHEMA.properties.revealed.items.enum, FACT_KEYS);
  assert.ok(COMMITMENT_ORDER.includes('deposit'));
  assert.equal(HIDDEN_STATE_SCHEMA.type, 'object');
  for (const k of ['revealed', 'bestCommitment', 'lastStatedWtp', 'sentiment', 'rapport']) assert.ok(HIDDEN_STATE_SCHEMA.required.includes(k));
  let st = newHiddenState();
  st = advanceState(st, 'past_specific', { revealed: ['lastIncident'], commitment: 'none', statedWtp: null, sentiment: 'positive' });
  st = advanceState(st, 'pitch', { revealed: [], commitment: 'pilot', statedWtp: 200, sentiment: 'polite' });
  st = advanceState(st, 'generic', { revealed: [], commitment: 'followup', statedWtp: null, sentiment: 'neutral' });
  assert.deepEqual(st.revealed, ['lastIncident']);
  assert.equal(st.bestCommitment, 'pilot');
  assert.equal(st.lastStatedWtp, 200);
  assert.equal(st.turns, 3);
  assert.ok(st.rapport >= 0 && st.rapport <= 1);
});

test('a product description is not an ask; incident questions are past-specific even when they mention paying', () => {
  assert.equal(detectAsk("I'm building a tool that automates invoice follow-ups. It tracks payments. Pretty cool, right?"), null);
  assert.equal(detectAsk('Mind if I follow up with you sometime?'), 'followup');
  assert.equal(detectAsk('Can I come back next Thursday with a prototype for 30 minutes?'), 'followup');
  assert.equal(classifyQuestion('Tell me about the last time a client paying late or an invoice slipping through. What actually happened?'), 'past_specific');
  assert.equal(classifyQuestion('And how did you deal with it in the moment?'), 'past_specific');
  assert.equal(classifyQuestion('Tell me a bit about how you handle getting paid.'), 'past_specific');
  assert.equal(classifyQuestion('What did that cost you last month, in hours or dollars?'), 'price_current');
  assert.equal(classifyQuestion('Can you put a number on what handling that costs you per month?'), 'price_current');
});

test('structured reveals: workaround, incident and spend each unlock once; current spend is spoken as the true number', () => {
  const p = person({ workaroundCostMonthly: 240.4 });
  const r1 = offlineAnswer(p, 'Walk me through how invoicing works for you today, start to finish.', [], seqRand(1));
  assert.deepEqual(r1.revealed, ['workaround']);
  const h1 = [{ from: 'me', text: 'Walk me through how invoicing works for you today, start to finish.' }, { from: 'them', text: r1.reply, revealed: r1.revealed }];
  const r2 = offlineAnswer(p, 'Tell me about the last time an invoice went out wrong. What actually happened?', h1, seqRand(2));
  assert.deepEqual(r2.revealed, ['lastIncident']);
  assert.ok(!r2.flags.some((f) => f.startsWith('text_leak')), 'phrases shared between workaround and incident are not a leak');
  const r3 = offlineAnswer(p, 'What are you paying for today to handle this: tools, people, anything?', [...h1, { from: 'me', text: 'x' }, { from: 'them', text: 'y', revealed: ['lastIncident'] }], seqRand(3));
  assert.deepEqual(r3.revealed, ['spend']);
  assert.match(r3.reply, /\$240\b/);
});

test('friends answer "is it a good idea?" with praise, strangers do not', () => {
  const q = "Do you think it's a good idea?";
  const praise = (p) => { let n = 0; for (let s = 1; s <= 12; s++) n += (offlineAnswer(p, q, [], seqRand(s)).reply.match(/great|love|amazing|awesome|good idea/gi) ?? []).length; return n; };
  assert.ok(praise(friend()) >= 3 * Math.max(1, praise(stranger())));
});
