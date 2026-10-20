// LLM judges for the player's channel work (affiliate outreach, partner kits, marketplace listings, PR pitches,
// ad reads, talk abstracts, co-marketing proposals, call scripts, mail notes, LTD applications, price-increase
// notices) with deterministic heuristic fallbacks. The judge returns a quality score that nudges the
// statistical model inside research ranges — it never decides outcomes alone (LLM = judgment, statistics = scale).

import { REPLY_PERSONA } from './rubric.js';
import { REALISM } from '../../core/llm.js';
import { BUZZ, SLOP, countHits, icpOverlap } from '../growth/judges.js';
import { hash } from '../../core/util.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const wc = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const specifics = (t) => (String(t ?? '').match(/\d+(\.\d+)?\s?(%|x|×|hours?|minutes?|days?|weeks?|months?|k\b)|\$\s?\d+|\d{2,}/gi) ?? []).length;

export const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['score', 'verdict', 'reply', 'issues', 'accept'],
  properties: {
    score: { type: 'number', description: '0-10: how well this works on someone like you (be harsh; 5 = ignorable, 8+ = rare).' },
    verdict: { type: 'string', description: 'One blunt sentence, in character.' },
    reply: { type: 'string', description: 'What you would actually write back (empty string if you would ignore it). Max 80 words.' },
    issues: { type: 'array', items: { type: 'string' }, description: 'Up to 3 specific problems, max 20 words each, quoting the text.' },
    accept: { type: 'boolean', description: 'Would you say yes / take the next step?' },
  },
};

// kind → persona, task, ideal word range, keywords that a good artifact of this kind should contain.
export const KINDS = {
  affiliate_outreach: { persona: (s) => `a creator/blogger who already writes about ${s.company.icp || 'this category'} and receives ~20 affiliate pitches a week`, task: 'Judge this affiliate-recruitment DM sent to you.', words: [40, 140], keys: ['commission', '%', 'recurring', 'your', 'audience', 'link'], personal: true },
  affiliate_brief: { persona: () => 'an affiliate deciding whether this program is worth promoting to your audience', task: 'Judge this affiliate brief / partner kit.', words: [120, 500], keys: ['commission', 'cookie', 'payout', 'audience', 'demo', 'prohibit', 'brand', 'coupon', 'example'], personal: false },
  referral_email: { persona: (s) => `an existing paying customer (${s.company.icp || 'typical user'}) who is moderately happy with the product`, task: 'Judge this email announcing a referral program.', words: [50, 180], keys: ['both', 'free', 'credit', 'month', 'link', 'friend', 'colleague'], personal: false },
  listing: { persona: (s) => `someone browsing an app marketplace searching for a tool for: ${s.company.icp || s.company.oneLiner || 'their job'}`, task: 'Judge this app-store listing (name, tagline, description). Would you install it?', words: [80, 400], keys: ['minute', 'install', 'connect', 'sync', 'automatically', 'free', 'trial', 'review'], personal: false },
  comarketing: { persona: (s, x) => `the ${x?.contact ?? 'partnerships lead'} at ${x?.name ?? 'a partner company'} (${x?.category ?? 'software company'}, audience ~${x?.audience ?? '?'})`, task: 'Judge this co-marketing proposal from a smaller company. Big partners rarely reciprocate for seed startups.', words: [60, 220], keys: ['audience', 'webinar', 'newsletter', 'customers', 'both', 'date', 'overlap'], personal: true },
  partner_pitch: { persona: (s, x) => `the owner of ${x?.name ?? 'an agency'} (${x?.type ?? 'agency'}), who already sells to ${s.company.icp || 'your customers'} and gets pitched by SaaS partner programs constantly`, task: 'Judge this partner-program pitch.', words: [60, 220], keys: ['margin', '%', 'clients', 'referral', 'training', 'deal', 'revenue'], personal: true },
  pr_pitch: { persona: (s, x) => `a ${x?.tier === 'tier1' ? 'tier-1 tech reporter' : 'trade journalist'} covering ${x?.beat ?? 'startups'} who gets 100+ pitches a day and replies to ~3%`, task: 'Judge this media pitch. Is there a story?', words: [60, 150], keys: ['data', 'exclusive', 'embargo', 'customers', 'raised', 'found', '%', 'first'], personal: true },
  ad_read: { persona: (s, x) => `a listener/viewer of "${x?.name ?? 'the show'}" in the middle of an episode`, task: 'Judge this sponsored ad read / talking points.', words: [60, 200], keys: ['code', '/', 'free', 'trial', 'because', 'i '], personal: false },
  talk_abstract: { persona: () => 'a conference program committee reviewer with 300 CFP submissions to read', task: 'Judge this talk proposal. Reject vendor pitches.', words: [100, 300], keys: ['learn', 'data', 'lessons', 'mistakes', 'case', 'how'], personal: false },
  call_script: { persona: (s) => `a busy ${s.company.icp || 'business owner'} who just picked up an unknown number`, task: 'Judge this cold-call opener/script. Would you stay on the line and agree to a meeting?', words: [60, 250], keys: ['?', 'reason', 'noticed', 'minute', 'worth'], personal: false },
  mail_note: { persona: (s) => `a ${s.company.icp || 'decision maker'} opening physical mail at the office`, task: 'Judge this direct-mail note.', words: [30, 150], keys: ['you', 'noticed', '?', 'call', 'link'], personal: false },
  ltd_application: { persona: () => 'an AppSumo-style deal scout who rejects most applicants and cares about broad appeal, demo-ability and support readiness', task: 'Judge this lifetime-deal application.', words: [100, 350], keys: ['users', 'support', 'limits', 'demo', 'roadmap', 'customers'], personal: false },
  tool_idea: { persona: (s) => `a ${s.company.icp || 'potential customer'} searching Google/ChatGPT for a quick free tool`, task: 'Judge this free-tool idea and page copy: would you use it, and does it lead naturally to the paid product?', words: [40, 250], keys: ['free', 'calculator', 'generator', 'check', 'grader', 'template', 'result'], personal: false },
  listicle_pitch: { persona: () => 'the author of a "best tools for X" listicle who is pitched daily to add vendors', task: 'Judge this request to be included in your list.', words: [50, 160], keys: ['review', 'customers', 'differen', 'pricing', 'honest', 'compare'], personal: true },
  price_notice: { persona: (s) => `an existing paying customer (${s.company.icp || 'typical user'}) reading a price-increase email`, task: 'Judge this price-increase notice. How do you feel; would you cancel?', words: [80, 300], keys: ['why', 'new price', 'from', 'starting', 'keep', 'locked', 'annual', 'added', 'thank'], personal: false },
  event_agenda: { persona: (s, x) => `a senior ${s.company.icp || 'buyer'} deciding whether a ${x?.format ?? 'event'} is worth an evening; you skip anything that is a vendor demo in disguise`, task: 'Judge this event topic and agenda. Is it peer value (learn from peers, real data, a guest practitioner) or a vendor pitch? Score vendor pitches 3 or lower.', words: [50, 250], keys: ['peers', 'share', 'learn', 'lessons', 'guest', 'discussion', 'questions', 'data'], personal: false },
  event_invite: { persona: (s, x) => `a busy ${s.company.icp || 'decision maker'} receiving an invitation to a ${x?.format ?? 'event'} from a founder you may not know`, task: 'Judge this event invitation. Would you RSVP yes?', words: [50, 180], keys: ['who', 'when', 'where', 'seats', 'join', 'peers', 'you'], personal: true },
  event_followup: { persona: (s, x) => `a ${s.company.icp || 'buyer'} who attended a ${x?.format ?? 'event'} yesterday and gets a follow-up from the host`, task: 'Judge this post-event follow-up. Does it reference what you discussed and offer a sensible next step, or is it a generic sales blast?', words: [40, 160], keys: ['you mentioned', 'discussed', 'next', 'call', 'notes', 'recording', 'week'], personal: true },
};

// How much a text reads as a vendor pitch rather than peer value (0..1). Counts the sender's own name, product-push
// phrases and pricing language, net of peer-format markers. Used by the hosted-events simulation regardless of the LLM
// panel (the panel's score is the quality, this is the "is it a pitch" signal) [design].
export function pitchiness(state, text) {
  const t = String(text ?? '').toLowerCase();
  if (!t.trim()) return 0;
  const name = String(state?.company?.name ?? '').toLowerCase().trim();
  const nameHits = name ? Math.max(0, t.split(name).length - 2) : 0;
  const push = (t.match(/\b(demo|demos|our (product|platform|tool|solution|software|app|features?)|new features?|pricing|discount|special offer|sign up|free trial|book a (call|demo)|see how \w+ (can|will)|product tour|walkthrough of|launch(ing)? (of )?our)\b/g) ?? []).length;
  const peer = (t.match(/\b(peers?|roundtable|share (what|how)|compare notes|lessons|what('s| is) working|benchmarks?|panel|guest|practitioners?|off the record|chatham house|no slides|no pitch|no sales|open discussion|your questions)\b/g) ?? []).length;
  return clamp(0.2 * nameHits + 0.17 * push - 0.08 * peer, 0, 1);
}

/**
 * Deterministic offline judge. Rewards: ideal length, kind-specific keywords, specifics (numbers), ICP fit,
 * personalization (names the recipient), a clear ask. Punishes: buzzwords, AI slop, walls of text.
 * → { score 0..10, verdict, reply, issues, accept }
 */
// Real sentences: at least six words with a verb. Kind keywords only count when they sit inside one, so a list of the
// words a judge looks for ("commission cookie payout audience …") earns nothing.
const VERB = /\b(is|are|was|were|am|be|been|get|got|use|used|try|make|made|pay|pays|paid|send|share|found|find|saw|see|saves?|saved|cut|cuts|run|ran|built|build|help|helps|need|want|would|could|can|will|do|did|does|have|has|had|lost|spent|take|took|keep|give|offer|earn|join|read|write|wrote|love|hate|think|know|noticed|asked|tested|learned|launch(ed)?|grew|stopped|started)\b|\w{3,}(ed|ing)\b/i;
const sentencesOf = (t) => String(t ?? '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => wc(x) >= 6 && VERB.test(x));
const tokensOf = (t) => String(t ?? '').toLowerCase().split(/[^a-z0-9%$']+/).filter((w) => w.length >= 3);
const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'with', 'that', 'this', 'are', 'our', 'was', 'have', 'from', 'but', 'not', 'can', 'its', 'they', 'their', 'what', 'who', 'would', 'will', 'all', 'any', 'one', 'out', 'how']);
/** Keyword-list or copy-paste padding: low word variety, one content word repeated, or a wall of the kind's keywords. */
export function stuffingOf(text, keys = []) {
  const toks = tokensOf(text);
  if (toks.length < 12) return { stuffed: false, diversity: 1, keyDensity: 0, maxRepeat: 0 };
  const counts = {};
  for (const w of toks) if (!STOP.has(w)) counts[w] = (counts[w] ?? 0) + 1;
  const maxRepeat = Math.max(0, ...Object.values(counts));
  const diversity = new Set(toks).size / toks.length;
  const low = String(text).toLowerCase();
  // Repeats of the kind's keywords (using each once is normal; saying "commission" four times is padding).
  const keyRepeats = keys.filter((x) => x.length >= 3 && !STOP.has(x)).reduce((a, x) => a + Math.max(0, low.split(x).length - 2), 0);
  const keyDensity = keyRepeats / toks.length;
  const sents = sentencesOf(text).length;
  const stuffed = (toks.length >= 25 && diversity < 0.45) || keyDensity > 0.08 || (maxRepeat >= 5 && maxRepeat / toks.length > 0.07) || (toks.length >= 25 && sents === 0);
  return { stuffed, diversity: +diversity.toFixed(2), keyDensity: +keyDensity.toFixed(2), maxRepeat };
}

// Each reader reacts in their own words (no coaching): good / middling / weak verdicts and what they would write back.
// {name} is the recipient or show; variants are chosen by a hash of the text so the same draft reads the same way.
const VOICE = {
  affiliate_outreach: { good: ['This is about my audience, not yours. I\'d look at the program.', 'Specific commission and it\'s clear you read my stuff. Rare.'], mid: ['Commission is fine, but this reads like the other twenty pitches this week.', 'I can\'t tell if you know who reads my blog.'], bad: ['Mass DM. Archived.', 'Nothing here tells me why my readers would care.'], reply: ['Send me the program terms and a demo login and I\'ll take a look.', 'OK, what\'s the cookie window and when do you pay out?'] },
  affiliate_brief: { good: ['I know what I earn, when I get paid and what I can\'t say. I could promote this.', 'Clear terms and assets. Easier than most programs.'], mid: ['Terms are there but I\'d still have to email you three questions.', 'Missing the bits that decide whether it\'s worth my time.'], bad: ['I have no idea what I\'d earn or what I\'m allowed to say.', 'A brand page, not a partner kit.'], reply: ['Looks workable. I\'ll sign up and try a post.', 'Fine, add me to the program.'] },
  referral_email: { good: ['Both of us get something concrete. I might actually forward this.', 'Short, and I know exactly what my colleague gets.'], mid: ['Nice, but I won\'t remember this when I talk to anyone.', 'I\'m not sure what my friend gets out of it.'], bad: ['Another "refer a friend" email. Deleted.', 'Feels like you\'re asking me to do your marketing.'], reply: ['Sent the link to a colleague who complained about the same problem.', 'Forwarded it to one person.'] },
  listing: { good: ['I can see what it does and how fast I\'d be set up. Installing.', 'Clear about what it connects to. Worth a try.'], mid: ['Probably does what I need, but the description doesn\'t prove it.', 'Fine listing; nothing makes it stand out from the other three.'], bad: ['I can\'t tell what this app actually does.', 'Buzzwords and no screenshots of the real thing. Next.'], reply: ['', ''] },
  comarketing: { good: ['Concrete idea, dates and a fair split. Worth raising internally.', 'You did the work on audience overlap. That\'s unusual.'], mid: ['Not sure what {name} gets out of this compared with what you get.', 'Vague "let\'s partner" with no specific idea or date.'], bad: ['A small company asking for our list. No.', 'This is a request for free distribution.'], reply: ['Interesting. Can you send two dates and a draft outline for the webinar?', 'Let\'s do a 20-minute call; send me your audience numbers first.'] },
  partner_pitch: { good: ['I can see the margin and why my clients would want it. Worth a call.', 'You know what we sell and to whom. I\'ll listen.'], mid: ['What\'s in it for us per client? Not clear.', 'Every SaaS wants to be in our stack. Why this one?'], bad: ['Partner-program spam. Deleted.', 'Nothing about margin, training or my clients.'], reply: ['Send me the partner terms and a sandbox. If it fits two clients I\'ll try it.', 'What margin, and who handles support? Then we can talk.'] },
  pr_pitch: { good: ['There\'s a story here, and numbers I can check.', 'That\'s a headline I could pitch to my editor.'], mid: ['A product update dressed as news.', 'Could be something, but I don\'t see the story yet.'], bad: ['A press release with my name on it. Deleted.', 'Nothing new, nothing I can verify.'], reply: ['Can you share the underlying data and a customer I can call?', 'This might work for a piece. Who can I talk to on the record?'] },
  ad_read: { good: ['That sounded like the host actually uses it. I\'d check the code.', 'Specific enough that I remembered the URL.'], mid: ['Standard ad read. I skipped ahead 30 seconds.', 'Fine, but generic.'], bad: ['Skipped.', 'Sounded like a script nobody tested.'], reply: ['', ''] },
  talk_abstract: { good: ['Clear takeaways and real data. Shortlisted.', 'A practitioner talk, not a vendor pitch. Shortlisted.'], mid: ['Topic is fine; the abstract doesn\'t tell me what attendees learn.', 'Borderline. Too close to a product demo.'], bad: ['Vendor pitch. Reject.', 'No takeaways, no data. Reject.'], reply: ['Accepted for review round two: send a speaker bio and outline.', 'Shortlisted, pending the full outline.'] },
  call_script: { good: ['You gave me a reason in ten seconds. Fine, book something.', 'You\'d noticed something real about us. I\'ll give you five minutes.'], mid: ['I\'d say "send me an email" and hang up.', 'Too long before I know why you called.'], bad: ['Click.', 'Telemarketing. Hung up.'], reply: ['OK, send me a calendar invite for next week.', 'Fine, Thursday afternoon, 15 minutes.'] },
  mail_note: { good: ['A handwritten-feeling note that mentions us. Kept it on the desk.', 'Specific, short, and there\'s a reason to reply.'], mid: ['Nice card, went in the drawer.', 'Generic. Recycling.'], bad: ['Junk mail.', 'Straight into the bin.'], reply: ['Called the number on the card.', 'Typed in the link to see what it is.'] },
  ltd_application: { good: ['Broad appeal, demo-able and support is planned. Moving to review.', 'Clear limits and a roadmap. Our buyers would like this.'], mid: ['Not sure our buyers get it in a 60-second demo.', 'Missing support and plan limits.'], bad: ['Too niche and no support plan. Pass.', 'Nothing here tells me it can handle thousands of buyers.'], reply: ['Moving you to the next review step; send a demo video.', 'Interested. What limits would the lifetime tier have?'] },
  tool_idea: { good: ['I\'d use this today, and I can see why the paid product exists.', 'Solves the quick job I searched for. Bookmarked.'], mid: ['Useful once; no reason to come back.', 'Another generator. I\'d use it and leave.'], bad: ['I don\'t understand what it does for me.', 'Looks like a lead-capture form pretending to be a tool.'], reply: ['Tried it and signed up to save the result.', 'Used it; might come back.'] },
  listicle_pitch: { good: ['Honest about who it\'s for and how it differs. I\'ll test it for the next update.', 'You gave me something my readers would want to know.'], mid: ['Every vendor says they\'re different.', 'I\'d need to see real reviews or pricing first.'], bad: ['"Please add us." No.', 'Pay-to-play energy. Ignored.'], reply: ['Send me a trial account; I\'ll consider it for the next refresh.', 'OK, send pricing and three customer reviews.'] },
  event_agenda: { good: ['Peers and real numbers, not a demo. I would block the evening.', 'I would learn something here even if I never buy. Worth going.'], mid: ['Sounds fine, but I cannot tell what I take away.', 'Borderline: smells a bit like a product tour.'], bad: ['A demo with dinner attached. Pass.', 'Vendor webinar. I would register and not show up.'], reply: ['Count me in if the seat is still open.', 'Interested; who else is coming?'] },
  event_invite: { good: ['Personal, specific, and I know who else is in the room. Yes.', 'Short and clear about why me. I would RSVP.'], mid: ['Polite, but it reads like a mass invite.', 'I might come if nothing else is on.'], bad: ['Mass invitation. Ignored.', 'Nothing tells me why I should give up an evening.'], reply: ['Thanks, I can make it. Send the details.', 'Possibly; send a calendar hold.'] },
  event_followup: { good: ['You remembered what I said and the next step makes sense. I will reply.', 'Specific and short. Happy to take the call.'], mid: ['Thanks for the note; generic but fine.', 'Reads like the same email everyone got.'], bad: ['Sales blast after a nice evening. Unsubscribe.', 'You clearly do not remember who I am.'], reply: ['Sure, Tuesday or Wednesday works.', 'Send me a couple of times next week.'] },
  price_notice: { good: ['I get why, I have time, and my price is safe for now. Fine.', 'Fair notice and a clear reason. I\'ll stay.'], mid: ['A bit annoyed, but I\'ll probably stay.', 'Not sure what I get for the extra money.'], bad: ['Price up, no reason, no notice. Looking at alternatives.', 'This makes me want to cancel.'], reply: ['Thanks for the heads-up and for keeping my price for now.', 'OK. I\'ll switch to annual before the date.'] },
};
const pickV = (arr, seed) => arr[parseInt(hash(seed), 36) % arr.length];

// What each reader cares about beyond the shared basics, from the persona context the UI passes in (`extra`).
function lens(state, kind, t, extra, f) {
  const low = t.toLowerCase();
  const company = String(state.company.name ?? '').toLowerCase();
  const mentionsName = company && low.split(company).length - 1;
  switch (kind) {
    case 'pr_pitch': {
      const funding = /\b(raised|seed|series [ab]|funding)\b/i.test(t);
      const data = f.spec >= 2 || /\b(survey|dataset|analy[sz]ed|we found|study)\b/i.test(t);
      if (extra.tier === 'tier1') return (data ? 0.4 : -1.4) + (funding ? 0.4 : 0) + (/\b(exclusive|embargo)\b/i.test(t) ? 0.3 : 0) - (f.fit > 0.5 && !data ? 0.5 : 0) - 0.6; // tier-1: needs news, harsher
      return (f.fit * 1.4) + (/\b(customer|client|store|shop|clinic|firm|agency)s?\b/i.test(t) ? 0.4 : 0) + (data ? 0.3 : -0.4) - 0.3; // trade: wants the industry angle
    }
    case 'talk_abstract': return -Math.min(2.5, Math.max(0, mentionsName - 1) * 1) - (/\b(our (product|platform|tool)|sign up|demo of)\b/i.test(t) ? 1.5 : 0) + (/\b(lessons?|mistakes?|we (tried|learned|measured))\b/i.test(t) ? 0.6 : 0);
    case 'partner_pitch': return (/\d+\s?%|margin|rev(enue)? share/i.test(t) ? 0.5 : -0.8) + (/\b(your clients|your customers)\b/i.test(t) ? 0.4 : 0) + (extra.type && low.includes(String(extra.type).toLowerCase().split(/\s+/)[0]) ? 0.3 : 0);
    case 'comarketing': return (Number(extra.audience) > 50000 ? -0.8 : Number(extra.audience) > 10000 ? -0.3 : 0.2) + (/\b(webinar|newsletter swap|guide|template|bundle|integration)\b/i.test(t) ? 0.3 : 0);
    case 'ad_read': return (extra.name && low.includes(String(extra.name).toLowerCase().split(/\s+/)[0]) ? 0.3 : 0) + (/\b(i|we) (use|tried|switched)\b/i.test(t) ? 0.6 : 0) - (f.buzz > 1 ? 0.6 : 0);
    case 'ltd_application': return (/\bsupport\b/i.test(t) ? 0.4 : -0.6) + (/\blimit|cap|quota\b/i.test(t) ? 0.3 : -0.3);
    case 'listicle_pitch': return (/\b(not for|isn'?t for|if you need|weakness|we don'?t)\b/i.test(t) ? 0.6 : 0) - (/\b(best|#1|leading)\b/i.test(t) ? 0.5 : 0);
    case 'event_agenda': return -3 * pitchiness(state, t) + (/\b(peers?|roundtable|lessons|what('s| is) working|guest|panel|benchmarks?|open discussion)\b/i.test(t) ? 0.5 : -0.4);
    case 'event_invite': return -1.5 * pitchiness(state, t) + (/\b(seats?|small group|\d+ (people|guests|peers|leaders))\b/i.test(t) ? 0.4 : 0) + (/\b(mon|tues|wednes|thurs|fri)day|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(t) ? 0.3 : -0.3);
    case 'event_followup': return (/\b(you (mentioned|said|asked)|when we (talked|spoke)|your (point|question))\b/i.test(t) ? 0.8 : -0.6) - 1.2 * pitchiness(state, t);
    case 'call_script': return (/\?/.test(t.slice(0, 220)) ? 0.4 : -0.4) - (wc(t.split(/[.?!]/)[0]) > 30 ? 0.6 : 0);
    default: return 0;
  }
}

export function heuristicJudge(state, kind, text, extra = {}) {
  const k = KINDS[kind] ?? KINDS.affiliate_outreach;
  const t = String(text ?? '');
  const low = t.toLowerCase();
  const n = wc(t);
  const [lo, hi] = k.words;
  const len = n < lo * 0.5 ? -3 : n < lo ? -1 : n > hi * 1.6 ? -2.5 : n > hi ? -1 : 1;
  const prose = sentencesOf(t).join(' ').toLowerCase();
  const keys = k.keys.filter((x) => prose.includes(x)).length / k.keys.length;
  const stuff = stuffingOf(t, k.keys);
  const buzz = countHits(t, BUZZ), slop = countHits(t, SLOP);
  const fit = icpOverlap(state, t);
  const spec = Math.min(4, specifics(t));
  const ask = /\?|would you|interested|can we|reply|book|call me|open to|let me know/i.test(t) ? 1 : 0;
  const name = extra.recipient && low.includes(String(extra.recipient).toLowerCase().split(/\s+/)[0]) ? 1 : 0;
  const personal = k.personal ? (name || /\{\{?\s*(first_?name|name)\s*\}?\}/i.test(t) ? 0.8 : -0.8) : 0;
  // Calibrated so a solid, specific draft lands ~6–8 and only exceptional work reaches 9 (real readers are harsh).
  let score = 2.2 + len + keys * 2.4 + Math.min(3, spec) * 0.4 + fit * 1.2 + ask * 0.5 + personal * 0.8 - buzz * 0.6 - slop * 0.8;
  score += lens(state, kind, t, extra, { spec, fit, buzz });
  if (stuff.stuffed) score = Math.min(score - 2.5, 3.2);
  if (kind === 'price_notice') {
    const hasDate = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}\/\d{1,2}|\bdays\b/i.test(t);
    const keep = /(keep|lock|grandfather|current price|annual)/i.test(t);
    const why = /(because|why|cost|invest|added|new feature|improv)/i.test(t);
    score += (hasDate ? 0.8 : -1) + (keep ? 0.6 : 0) + (why ? 0.8 : -1.2) - (/sorry for the inconvenience|unfortunately/i.test(t) ? 0.4 : 0);
  }
  score = +clamp(score, 0, 10).toFixed(1);
  const issues = [];
  if (n < lo) issues.push(`Too thin (${n} words) to be convincing.`);
  if (n > hi) issues.push(`Too long (${n} words): people skim.`);
  if (buzz + slop > 1) issues.push('Generic marketing language; reads like AI-written outreach.');
  if (keys < 0.3) issues.push('Missing the specifics this reader needs to decide.');
  if (k.personal && !personal) issues.push('Not personalized to the recipient.');
  if (!ask && kind !== 'price_notice' && kind !== 'listing' && kind !== 'affiliate_brief') issues.push('No clear ask or next step.');
  if (stuff.stuffed) issues.unshift('Reads like a list of keywords or repeated filler, not a message.');
  const accept = score >= 6.5;
  const V = VOICE[kind] ?? VOICE.affiliate_outreach;
  const seed = `${kind}|${t}`;
  const fill = (s) => String(s).replace(/\{name\}/g, extra.name ?? 'us');
  return {
    score,
    verdict: fill(pickV(score >= 7 ? V.good : score >= 5 ? V.mid : V.bad, seed)),
    reply: accept ? fill(pickV(V.reply, `${seed}|r`)) : '',
    issues: issues.slice(0, 3),
    accept,
  };
}

/**
 * Judge an artifact with the LLM panel (cached by content) and return { quality 0..1, score, results, mock }.
 * extra: context object passed to the persona builder ({ name, audience, tier, beat, recipient … }).
 */
export async function judgeArtifact(ctx, kind, text, extra = {}) {
  const state = ctx.state;
  const k = KINDS[kind];
  // What a stranger can see about the sender: name and the public one-liner (their website), not the internal ICP.
  const company = `${state.company.name}: ${state.company.oneLiner || '(no one-liner)'}`;
  const res = await ctx.llm.panel({
    task: `channels_${kind}`,
    system: `${REALISM}\nYou are ${k.persona(state, extra)}. The year is 2026.`,
    prompt: `${k.task}\nThe sender: ${company}.\n${extra.context ? `Context: ${extra.context}\n` : ''}\n=== TEXT ===\n${String(text).slice(0, 6000)}\n=== END ===`,
    schema: JUDGE_SCHEMA,
    temperature: 0.7,
    maxTokens: 1700,
    fallback: () => heuristicJudge(state, kind, text, extra),
    cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const scores = results.map((r) => clamp(Number(r.score) || 0, 0, 10));
  const score = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
  return { quality: +clamp(score / 10, 0, 1).toFixed(3), score: +score.toFixed(1), results, mock: results.every((r) => r.mock), day: state.day, words: wc(text) };
}

// A single persona reply (e.g. a partner answering a proposal), consistent with a decision the game already made.
export const REPLY_SCHEMA = { type: 'object', additionalProperties: false, required: ['subject', 'body'], properties: { subject: { type: 'string' }, body: { type: 'string', description: 'Max 120 words, in character, plain text.' } } };

export async function personaReply(ctx, { persona, situation, decision, fallback }) {
  const r = await ctx.llm.ask({
    task: 'channels_reply',
    system: `${REALISM}\nYou are ${persona}. The year is 2026. Write a short, realistic email reply.\n${REPLY_PERSONA}`,
    prompt: `${situation}\n\nYour decision (already made, do not change it): ${decision}.\nWrite the reply email consistent with that decision.`,
    schema: REPLY_SCHEMA,
    temperature: 0.8,
    maxTokens: 1500,
    fallback,
    cache: ctx.state.cache,
  });
  return { ...r.data, mock: r.mock };
}
