// Judging rubrics for the sales cluster. Sources and anchors' rationale: docs/research/judging/sales.md.
// LLM scores each criterion 1-5; the game applies the weights (core/rubric.js weighted()).
import { personaText } from '../../core/rubric-schema.js';

export const COLD_EMAIL_RUBRIC = [
  { key: 'relevance', label: 'Relevant to my role and problem', weight: 2,
    anchors: { 1: 'could be sent to any company; no problem named for my role', 3: 'right role and problem area but a generic reason', 5: 'names a problem someone in my role at my company plausibly has, visible on my site or title' } },
  { key: 'specificity', label: 'Specific, checkable fact about me', weight: 2,
    anchors: { 1: 'only merge tags (my name, my company)', 3: 'one true fact about me that is not tied to the offer', 5: 'a verifiable fact about me (page, hire, launch) that explains why this offer; could not be sent to another company' } },
  { key: 'single_ask', label: 'One easy ask', weight: 1.5,
    anchors: { 1: 'no ask, or two or more asks', 3: 'one ask but heavy (30-minute demo, calendar link) or no reason given', 5: 'one low-friction ask (interest question, 15 minutes) tied to a stated outcome' } },
  { key: 'brevity_plain', label: 'Short and plain', weight: 1,
    anchors: { 1: 'over 150 words, feature list or jargon', 3: '100-150 words or some filler', 5: 'about 40-100 words, plain words, first line about me not the sender' } },
  { key: 'credibility', label: 'Credible, not spam', weight: 1.5,
    anchors: { 1: 'hype, unproven claims, flattery that sounds AI-written', 3: 'neutral, no proof', 5: 'one concrete proof (named result, number, comparable customer) and nothing the product cannot do' } },
];

export const SCORECARD_RUBRIC = [
  { key: 'pain_depth', label: 'Pain uncovered', weight: 3,
    anchors: { 1: 'never asked about the problem, or only hypotheticals', 3: 'asked what the problem is and got a surface answer', 5: 'got a specific recent incident ("last time") and what they tried' } },
  { key: 'question_craft', label: 'Question craft (Mom Test)', weight: 2,
    anchors: { 1: 'leading, hypothetical or compliment-fishing questions, or under 3 questions', 3: '5-10 open questions with some follow-ups', 5: '11-14 open past-behaviour questions; follow-ups quote the prospect\'s previous answer; none stacked' } },
  { key: 'listening', label: 'Talk ratio and space', weight: 1.5,
    anchors: { 1: 'founder over 60% of words or monologues over 90 words', 3: 'founder 45-60% of words', 5: 'founder under 40% of words; room after answers' } },
  { key: 'quantified_impact', label: 'Cost of the problem quantified', weight: 2,
    anchors: { 1: 'no numbers', 3: 'one hours or dollars figure not tied to a cost', 5: 'cost in dollars and time per occurrence plus the consequence of doing nothing' } },
  { key: 'stakeholders_process', label: 'Who decides and how they buy', weight: 1.5,
    anchors: { 1: 'never asked who decides or how they buy', 3: 'learned the signer or the timeline', 5: 'signer, budget, process, paperwork and alternatives (including do nothing) all on record' } },
];

// Role-play personas: what makes the person respond, concede or go quiet (not a grader voice).
export const THREAD_PERSONA = personaText('What makes you reply, agree or go quiet (apply these to the seller\'s latest email):', [
  'You answer when they answered what you actually asked, used a detail of your own situation, and proposed one small concrete next step.',
  'You cool off when they repeat an ask you already declined, pitch features before showing they understand your problem, or write long.',
  'Interest score: 0-2 = they ignored your point or pushed; about 5 = relevant but unproven; 8+ = specific to your situation with an easy next step.',
  'Unsubscribe if they keep pushing after you said no.',
  'Only describe a problem you actually have according to your private record; leading questions do not create one.',
]);

export const CALL_PERSONA = personaText('How you behave on this call (earned, not given):', [
  'Reveal one hidden fact per well-aimed question about something that really happened (last time, what it cost, what you tried). Ask-anything or hypothetical questions get vague answers.',
  'You get shorter and cooler after a monologue, a pitch before they understood your problem, or several questions stacked in one turn.',
  'You warm up when the seller repeats your own words back and asks a follow-up on them.',
  'Engagement 0-3 = being pitched at; 4-6 = polite; 7-10 = they understand your problem and are specific.',
  'Agree to a next step only if it is concrete and dated and you have real pain; "send me info" is a polite brush-off.',
  'Your private record says whether the problem is real for you. If it is not, never admit to pain because the seller assumes it; be polite, curious or indifferent as your record says.',
]);

export const RENEWAL_PERSONA = personaText('What makes you concede or dig in at renewal:', [
  'You concede when they trade rather than give: a longer term, a reference or case study, or an uplift justified by value and usage numbers you can see.',
  'You respect them acknowledging your real complaints (open bugs, slow support, low usage) before they ask for more money.',
  'You get suspicious of words like "generous" or "fair offer", of an immediate discount at the first push (the price was padded), and of uplifts above 10-15% with no new value.',
  'If the competitor offered a discount, you use it as leverage unless they show a concrete reason to stay.',
]);
