// Offline inbound messages and replies (the deterministic fallback when no LLM is configured).
//
// The old fallback had one sentence per CATEGORY: all seven spam archetypes (offshore dev shop, SEO link seller, fake
// investor, registry-invoice scam...) arrived as the same "500 qualified leads/month" email from "LeadBoost", every
// investor was "Northbeam Ventures", and a genuine customer lead read word for word like a tire kicker. Reading the inbox
// carefully could not teach anything offline.
//
// Now each archetype has its own voice and sender pool, and what the message hides decides what it shows the way it
// does in a real inbox: a worthless or predatory sender usually leaves one of that archetype's tells (from
// data/inbound-archetypes.js redFlags, written in their voice), a genuine one usually carries a concrete detail that
// only a real buyer, investor or journalist would give. Neither is certain: [design] 75% of waste/scam messages carry
// a tell and 12% of genuine ones carry a misleading one, so careful reading helps without being an answer key.
// Variants are chosen by hash of the inbound id: no shared RNG draws, so the simulation stream is unchanged.

import { hash } from './util.js';
import { customerTypeOf } from './customer-type.js';
import { publicFacts, scrubInbound } from './public-facts.js';

const unit = (key) => (parseInt(hash(String(key)), 36) % 10007) / 10007;
const choose = (key, arr) => arr[Math.floor(unit(key) * arr.length) % arr.length];

export const TELL_SHARE = { bad: 0.75, good: 0.12 }; // [design]

// Who a genuine customer is, by the company's customer type (the market the founder chose).
const BUYER = {
  startups: ['Head of Ops at a 25-person seed-stage startup', 'engineering manager at a Series A startup'],
  local_smb: ['owner of two dental offices', 'owner of a family-run bakery with three locations', 'office manager at a local accounting firm'],
  ecommerce: ['founder of a Shopify store doing about $80k a month', 'ops lead at a DTC skincare brand'],
  mid_market: ['Director of Operations at a 400-person logistics company', 'RevOps manager at a 250-person software company'],
  enterprise: ['Senior Manager, Process Excellence, at a 6,000-person insurer', 'IT program manager at a global manufacturer'],
  consumers: ['a subscriber', 'someone who found the app last week'],
};
const buyerFor = (s, key) => {
  const t = customerTypeOf(s) ?? { b2c: 'consumers', ent: 'mid_market' }[s.company.model] ?? 'startups';
  return choose(`${key}:buyer`, BUYER[t] ?? BUYER.startups);
};

// Per archetype: sender companies, subjects, bodies, a tell for bad outcomes and a concrete detail for good ones.
// Slots: {F} founder first name, {C} company, {W} what it does, {ME} sender first name, {CO} sender company, {B} buyer.
const T = {
  offshore_dev_shop: { co: ['Codevista Labs', 'NexaSoft Solutions', 'BrightPixel Dev'], subj: ['Scaling {C} engineering', 'Dedicated developers for {C}'],
    body: ['Hi {F}, I came across {C} and love what you are building. We are a team of 120+ engineers and help founders ship faster with dedicated developers from $25/hour. We noticed you are on React and Node; we have done similar work for fintech and healthcare apps. Worth a 15-minute call?',
      'Hello {F}, congrats on the progress with {C}! Many founders we work with struggle to hire senior developers fast. Our vetted team can start next week at a fraction of US rates. Can I share a few case studies?'],
    tell: ['Here is my calendar link to grab 15 minutes: calendly.com/{me}-bd', 'Bumping this to the top of your inbox in case you missed it.'], good: ['One of our senior engineers is looking for a long-term role with a product company rather than agency work; happy to introduce.'] },
  leadgen_agency: { co: ['PipelineForge', 'MeetingFlow Agency', 'Outbound Kings'], subj: ['{C} + 20 meetings in 30 days', 'Quick question about {C} pipeline'],
    body: ['Hi {F}, we book 15-30 qualified meetings in 30 days for B2B founders, done for you: list, copy, sending, booking. Pay per meeting if you prefer. Open to a quick chat this week?',
      '{F}, saw {C} and figured your calendar could use more demos. Our SDR team runs outbound end to end and we only take a few new clients a month. Want me to send pricing?'],
    tell: ['Results guaranteed or your next month is free.', 'We have helped 200+ SaaS companies (happy to share names on a call).'], good: [] },
  seo_link_seller: { co: ['RankRise Media', 'LinkPeak Outreach', 'gmail.com'], subj: ['Guest post on DA 70+ sites for {C}', 'Collaboration request'],
    body: ['Hi, I am {ME}, an outreach manager. I can place a guest post for {C} on DA 70+ tech and business sites with a do-follow link. Prices start at $150 per placement. Interested?',
      'Hello team {C}, we have link insertion opportunities on high-authority blogs in your niche. Fast turnaround, permanent links. Shall I send the site list?'],
    tell: ['Payment via PayPal before publishing; we never mark posts as sponsored.', 'Our sites get 50k+ monthly traffic (screenshots available).'], good: [] },
  fractional_exec: { co: ['Independent', 'Northgate Advisory', 'Scale Partners'], subj: [''],
    body: ['Hi {F}, thanks for connecting. I am a fractional CMO and have helped 50+ SaaS companies scale from $1M to $10M ARR. Would love to share a few ideas for {C}.',
      '{F}, I work as a fractional VP Sales with early B2B teams. Founders at your stage usually hit a wall around repeatable sales. Open to a quick call to see if I can help {C}?'],
    tell: ['I have a 3-month engagement starting at $8,000 a month that most founders find pays for itself.'], good: ['I ran sales for two companies selling to {B}s; the first thing I would check is your trial-to-paid step, happy to look for free.'] },
  launch_upvote_seller: { co: ['Hunter Network', 'LaunchBoost'], subj: [''],
    body: ['{?launched}Hey {F}, congrats on the launch! We help products land in the top 5 of the day with our network of 3,000+ active hunters. Packages from $300.', 'Saw {C} is launching! We can get you hundreds of upvotes and comments from real accounts within hours. DM for pricing.'],
    tell: ['Top 5 guaranteed or a full refund.'], good: [] },
  directory_submission: { co: ['ListMyStartup', 'SaaSHub Submit Pro'], subj: ['Submit {C} to 300+ directories', 'Get {C} listed everywhere'],
    body: ['Hi {F}, we submit your startup to 300+ SaaS directories and AI tool lists for backlinks and traffic. One-off fee, report in 7 days. Want the list?', 'Hello, {C} is not listed on most AI and SaaS directories yet. We can fix that this week for a one-time fee.'],
    tell: ['Most of these directories are on our own network, so approval is guaranteed.'], good: [] },
  scam_misc: { co: ['Domain Registry Services', 'Global Trademark Office', 'WorldBiz Directory'], subj: ['FINAL NOTICE: {C} domain registration', 'Trademark renewal required for {C}'],
    body: ['Dear {C} owner, the registration of your business name in our international directory expires soon. To keep your listing active, pay the attached invoice within 5 days.', 'NOTICE: an application to register "{C}" in Asia has been filed by a third party. As your registrar we can block it if you confirm within 48 hours.'],
    tell: ['Failure to pay will result in removal of your listing and loss of priority.'], good: [] },
  fake_investor: { co: ['Crestline Capital Partners', 'Meridian Global Fund', 'Apex Horizon Ventures'], subj: ['Investment interest: {C}', 'Term sheet for {C}'],
    body: ['Dear {F}, our fund has reviewed {C} and we are prepared to invest $2-5M without the usual months of meetings. We move quickly for founders with strong vision. Please confirm interest and we will send next steps.', 'Hello {F}, I represent a family office interested in {W}. We can issue a term sheet within 10 days.'],
    tell: ['To begin, our legal team requires a refundable due-diligence fee.', 'Our investment committee only needs a short form and the processing fee to proceed.'], good: [] },
  saas_tool_vendor: { co: ['Dashly', 'Churnwise', 'Stackflow'], subj: ['Quick question', '{C} + Dashly'],
    body: ['{?funded}Hi {F}, congrats on the {ROUND}! Teams like {C} use our analytics to cut churn by 20%. Worth a look?',
      'Hi {F}, saw {C} and figured revenue analytics will matter as soon as customers start paying. Teams at your stage use us to see MRR, churn and expansion in one place. Worth a look?', 'Hi {F}, quick question: who handles revenue analytics at {C}? We help SaaS teams like yours see MRR, churn and expansion in one place.'],
    tell: ['Following up a third time in case this got buried.'], good: ['Not a pitch: we published a benchmark of churn at {B}-focused tools, and your pricing page made me think it might be useful. Link inside, no form.'] },
  finance_vendor: { co: ['Revenue Capital Co', 'FlexFund', 'Ledgerly'], subj: ['Non-dilutive capital for {C}', 'Funding for {C} in 48 hours'],
    body: ['Hi {F}, we provide non-dilutive capital to SaaS companies: $50k-$2M, repaid from revenue. Decision in 48 hours. Interested?', 'Hello {F}, bookkeeping and tax for startups, flat monthly price, CPA reviewed. Can I send a quote for {C}?'],
    tell: ['Flat 8% fee, no APR to worry about, and we do not need to see your bank data to send an offer.'], good: ['We usually need 6 months of Stripe and bank data before we can say anything useful; if you are not there yet I would wait.'] },
  pay_to_speak_or_award: { co: ['SaaS Summit Global', 'Future of Tech Awards', 'Innovators Forum'], subj: ['{F}, you have been selected as a speaker', '{C} nominated for an Innovation Award'],
    body: ['Dear {F}, our committee selected you to speak at our international summit in Dubai this spring, alongside leaders from top tech companies. Please confirm within 7 days to secure your slot.', 'Congratulations! {C} has been shortlisted for our Innovation of the Year award. Finalists receive global media exposure.'],
    tell: ['A speaker package (from $1,500) covers your stage slot, branding and the gala dinner.', 'Finalists confirm with a small nomination fee.'], good: [] },
  event_invite: { co: ['Founders Dinner Series', 'B2B SaaS Meetup', 'Startup Grind chapter'], subj: ['Invite: founders dinner next month', 'Join us at {CO}'],
    body: ['Hi {F}, we host a small dinner for B2B founders every month. Next one is in three weeks; would you like to join?', 'Hey {F}, we run a quarterly meetup for SaaS founders and operators. Would love to see {C} there.'],
    tell: ['Founder tickets are $650 (early bird), attendee list shared after purchase.'], good: ['Twelve people this time: four founders selling to {B}s and two operators from larger companies in your space; seats are free.'] },
  pay_to_play_podcast: { co: ['The SaaS Growth Show', 'Founder Stories Podcast'], subj: ['Podcast guest invitation for {F}', 'Feature {C} on our show'],
    body: ['Hi {F}, we would love to have you on our podcast to share the story behind {C}. Our audience is founders and investors.', 'Hello {F}, we feature fast-growing startups like {C} on our show and newsletter. Interested in being a guest?'],
    tell: ['Guests cover a one-time production and editing fee.', 'We have a few slots left this quarter; the guest package includes promotion.'], good: ['We are at episode 140 with about 6,000 downloads per episode, mostly B2B operators; no fee, we record over Riverside.'] },
  journalist: { co: ['TechCrunch contributor', 'The Information', 'a trade newsletter'], subj: ['Request for comment: {W}', 'Story on tools like {C}'],
    body: ['Hi {F}, I am writing a piece on new tools for {B}s and came across {C}. Do you have 15 minutes for a few questions this week?', 'Hi {F}, I cover startups in your space. Could you comment on how small teams are using AI for {W}?'],
    tell: ['My deadline is today at 5pm; as a contributor I ask for a small fee for featured placement.'], good: ['My deadline is Thursday; I would quote you by name and link {C}. Two questions below so you can answer by email if easier.'] },
  legit_podcast_or_newsletter: { co: ['Indie SaaS Weekly', 'The Operator Podcast'], subj: ['Guest spot on our show', 'Feature in our newsletter'],
    body: ['Hi {F}, I run a newsletter for SaaS operators and would love to feature {C} in an upcoming issue. Interested?', 'Hey {F}, we host a podcast about building B2B software and your story sounds like a fit. Would you join us?'],
    tell: ['We are just getting started (three episodes so far), so this would help us grow too.'], good: ['About 9,000 subscribers, 48% open rate, mostly founders and ops leads; we would run it in two weeks.'] },
  agency_recruiter: { co: ['TalentBridge', 'Apex Search Partners'], subj: [''],
    body: ['Hi {F}, I work with fast-growing startups on hiring. Would love to learn about {C}\'s hiring plans this year.', '{F}, I have three strong senior engineers on the market right now who would be a great fit for {C}. CVs attached.'],
    tell: ['Our fee is 25% of first-year salary, and I have attached CVs so we can get moving.'], good: ['I recruit only for early B2B teams; one candidate I placed before is now leaving after an acquisition and asked about companies like yours.'] },
  recruiter_poaching_founder: { co: ['a Series C fintech', 'a big-tech recruiting team'], subj: [''],
    body: ['Hi {F}, your background caught my eye. We are hiring a Head of Product, base $260k plus equity. Open to a chat?', '{F}, I know you are building {C}, but would you consider a senior role on our team? The package is strong.'],
    tell: ['The role is based on your old title, but the comp is real: $280k base.'], good: [] },
  cold_job_seeker: { co: ['Freelance', 'gmail.com'], subj: ['Application: any open role at {C}', 'Excited about {C}'],
    body: ['Hi! I am passionate about your innovative platform and would love to join {C} in any role. CV attached.', 'Hello {F}, I am a full-stack developer with 4 years of experience. Is {C} hiring?'],
    tell: ['I am a results-driven, detail-oriented team player with a proven track record.'], good: ['I used {C} for a client last month and noticed the CSV import fails on dates in DD/MM format; I wrote a fix in my fork if useful.'] },
  student_researcher: { co: ['a university research lab', 'an MBA program'], subj: ['Research interview request', 'Student project on {W}'],
    body: ['Hi {F}, I am a graduate student researching founders building {W}. Could I interview you for 30 minutes?', 'Hello, our MBA team is studying early-stage SaaS. Would you be open to a short call about {C}?'],
    tell: ['It is just 30 minutes (we might run over a bit).'], good: ['We are surveying 40 {B}s about how they handle this today; we can share the raw results with you.'] },
  vc_associate_checkin: { co: ['Northbeam Ventures', 'Foundry Hill Capital', 'Lattice Partners'], subj: ['{C} intro', 'Following {C}'],
    body: ['Hi {F}, I am an associate at {CO}. We have been spending time on {W} and {C} came up. Would love to learn more. Free for a quick chat?', 'Hey {F}, came across {C}. We invest at pre-seed and seed in B2B software. Open to a 20 minute intro?'],
    tell: ['Could you send your deck, metrics and roadmap ahead of the call so I can share internally?'], good: ['A partner here led our last two deals in this space and asked me to reach out; she would join the call.'] },
  angel_or_scout: { co: ['angel investor', 'scout for a seed fund'], subj: [''],
    body: ['hey {F}, a friend sent me {C}. I angel invest a bit in B2B tools. coffee next week?', 'hi {F}, I scout for a seed fund and saw {C}. would love to hear more, free this week?'],
    tell: ['I would want an advisor role with some equity on top if I invest.'], good: ['I wrote a $25k check into a company selling to {B}s last year and can intro you to the founder too.'] },
  indie_fund: { co: ['an indie SaaS fund', 'a revenue-based fund'], subj: ['Funding for profitable SaaS like {C}', 'Bootstrapper-friendly capital'],
    body: ['Hi {F}, we back bootstrapped SaaS founders with flexible capital, no board seats. Would love to learn about {C}.', 'Hello {F}, we invest in capital-efficient SaaS. If {C} has early revenue, we should talk.'],
    tell: ['Our program fee is $2,000, credited against the investment.'], good: ['Our terms are public on our site: a capped revenue share and no board seat; happy to walk you through them.'] },
  inbound_demo_qualified: { co: ['{LAST} & Co', 'Harborview Group', 'Copperline'], subj: ['Demo request', 'Question about {C} pricing'],
    body: ['Hi, I am the {B}. We are dealing with exactly this problem. Does {C} work for a team like ours, and what does it cost?', 'Hello, found your site through a search. I am the {B} and we are evaluating options this month. Can we see a demo?'],
    tell: ['Not sure about budget or timing yet, just looking around. (sent from my personal Gmail)'], good: ['We are on spreadsheets today and losing about a day a week to it; we have budget approved for this quarter and two of us would be on the demo.'] },
  tire_kicker: { co: ['{LAST} Consulting', 'a small agency'], subj: ['Interested, with one question', 'Lifetime deal?'],
    body: ['Hi, I like {C}. I would buy if you add a few things. Do you have a lifetime deal?', 'Hey, interesting product. Can you do 80% off for the first year? We are a small team.'],
    tell: ['We would sign today if you can add integrations with five more tools first.'], good: ['I am the {B}; the one thing stopping us is SSO, and if that is on your roadmap I can get a pilot approved.'] },
  b2c_user_feedback: { co: ['gmail.com'], subj: ['Feedback on the app', 'Problem with my subscription'],
    body: ['Hi, I have been using the app for two weeks. Mostly love it, but a couple of things bug me.', 'Hello, I was charged again and I thought I had cancelled. Can you help?'],
    tell: ['If I do not get a full refund today I am leaving a 1-star review.'], good: ['I use it every morning; the reminder at 7am is the thing I would pay more for, but the sync with my calendar breaks twice a week.'] },
  competitor_posing_as_customer: { co: ['a "consultancy"', 'gmail.com'], subj: ['Evaluating {C}', 'Detailed questions'],
    body: ['Hi, we are evaluating tools like {C}. Can you walk me through your pricing logic, roadmap and how you built the core engine?', 'Hello, our company is considering {C}. Could you share your architecture, which model providers you use and your margins at each tier?'],
    tell: ['Our use case is still taking shape, so I am mostly interested in how you do it.'], good: [] },
  integration_partner: { co: ['Stackwise', 'Flowmatic', 'Syncbase'], subj: ['Integration: {C} + {CO}', 'Partnership idea'],
    body: ['Hey {F}, our customers keep asking about {W}. Worth exploring an integration or co-marketing?', 'Hi {F}, we run a workflow platform used by 4,000 small businesses. An integration with {C} could make sense.'],
    tell: ['The first step is a featured listing in our marketplace ($499 a year).'], good: ['Our partner engineer can build the first version of the connector on our side; we have 30 shared customers asking already.'] },
  reseller_affiliate: { co: ['Growth Partners Network', 'an agency network'], subj: ['Reselling {C} to our clients', 'Affiliate partnership'],
    body: ['Hi {F}, we work with 200+ small businesses and could resell {C}. What commission do you offer?', 'Hello, we run an agency network and would like to white-label {C} for our clients.'],
    tell: ['We would need 50% recurring and free accounts for all our clients before we start.'], good: ['We already pay for two tools in your category for clients and could move three of them to you this month at a standard 20% referral fee.'] },
  co_marketing_swap: { co: ['a complementary SaaS', 'a newsletter'], subj: [''],
    body: ['Hey {F}, we sell to a similar audience. Want to do a newsletter swap or a joint webinar?', 'Hi {F}, love {C}. Co-marketing idea: we feature you, you feature us?'],
    tell: ['Our list is around 300 people, mostly students, but growing fast.'], good: ['Our list is 7,000 {B}s; a webinar last quarter with another tool brought them 40 trials.'] },
  advisor_for_equity: { co: ['Self-employed', 'ex-VP at a SaaS unicorn'], subj: [''],
    body: ['Saw what you are doing with {C}. I have scaled two SaaS companies and could help as an advisor for a bit of equity. Coffee?', 'Hi {F}, I advise early-stage founders on GTM. I think I could add a lot of value to {C}.'],
    tell: ['Advisors with my background usually get 2-3%, no vesting needed.'], good: ['I can make intros to three heads of ops at {B} companies I worked with; standard FAST terms with vesting are fine.'] },
  pick_your_brain: { co: ['a stealth startup', 'an early-stage founder'], subj: [''],
    body: ['Hey {F}! Fellow founder here building nearby. Would love to pick your brain on what is working.', 'Hi {F}, I am starting something adjacent to {C}. Could I grab 30 minutes to learn from you?'],
    tell: ['Also, could you share your investor list and which vendors you use?'], good: ['Specific question: how did you price your first annual contracts? I can share what we learned from 20 calls with {B}s in return.'] },
  peer_founder_ally: { co: ['a founder you met at a meetup', 'a fellow indie founder'], subj: [''],
    body: ['hey {F}, how is {C} going? we just crossed a milestone and I learned a ton, happy to swap notes', '{?launched}yo {F}, saw your launch, nice. want to trade notes on what is working this month?', 'yo {F}, how is the build going? want to trade notes on what is working this month?'],
    tell: ['also, could you intro me to your investors? :)'], good: ['our biggest win was changing the trial to a guided setup call; happy to show you our script'] },
  micro_acquirer_broker: { co: ['a micro-PE buyer', 'a SaaS brokerage'], subj: ['Interested in acquiring {C}', 'Buyers for businesses like {C}'],
    body: ['Hi {F}, we acquire small SaaS businesses. Would you consider selling {C}?', 'Hello {F}, I have qualified buyers looking for SaaS like {C}. Open to a confidential chat?'],
    tell: ['To start, could you share your last 12 months of P&L and MRR?'], good: ['We have closed six deals in this size range; happy to walk you through how we value them before you share any numbers, NDA first.'] },
  corp_dev: { co: ['Corp Dev, Atlas Software', 'Corporate Development, a larger platform'], subj: ['Exploring {C}', 'Partnership or more'],
    body: ['Hi {F}, I lead corp dev at a larger software company. We are keeping tabs on {W}. Open to an exploratory chat?', 'Hi {F}, our team is mapping the landscape around {W} and {C} stands out. Would you have 30 minutes?'],
    tell: ['It would help to understand your revenue, growth and what a deal would need to look like for you.'], good: ['Our product team wants to understand whether a partnership around shared customers makes sense; no numbers needed for a first call.'] },
  friend_family_checkin: { co: [''], subj: [''],
    body: ['hey!! how is the startup going?? we should catch up', 'hiii, mom says you quit your job for {C}?? tell me everything'],
    tell: ['also have you thought about doing an app like uber but for dog walking? huge market'], good: ['also my boss is the {B} type you mentioned, she was complaining about exactly this last week, want me to connect you?'] },
  former_colleague: { co: ['your old company', 'a former colleague'], subj: [''],
    body: ['Hey {F}, long time! Saw you started {C}. How is it going?', '{F}! Just saw your post about {C}. Proud of you. Let us catch up.'],
    tell: ['By the way, I started selling insurance on the side, would love to tell you about it.'], good: ['My team at work is literally the {B} profile; I could set up a call with my manager.'] },
};

const GOOD = new Set(['intro_customer', 'intro_investor', 'intro_partner', 'customer_lead', 'investor_meeting', 'press', 'hire', 'advice']);

function fill(t, v) {
  return String(t ?? '').replace(GATE, '').replace(/\{(F|C|W|ME|me|CO|B|LAST|ROUND)\}/g, (_, k) => v[k] ?? '');
}
// Variants that assume public news start with a marker: {?funded} (a round was announced) or {?launched} (the product is
// live). Only variants the company's public facts support are eligible, so a template never congratulates a raise or a
// launch that did not happen.
const GATE = /^\{\?(funded|launched)\}/;
function eligible(arr, facts) {
  const ok = (arr ?? []).filter((t) => {
    const g = String(t).match(GATE)?.[1];
    return !g || (g === 'funded' ? Boolean(facts.funding) : facts.launched);
  });
  return (ok.length ? ok : (arr ?? []).filter((t) => !GATE.test(t)));
}

/** Offline inbound message for an archetype and its hidden outcome. names: { first, last } (drawn by the caller). */
export function offlineInbound(state, a, inb, { first, last }) {
  const k = String(inb.id);
  const tpl = T[a.id];
  const founderFirst = String(state.founder?.name ?? 'there').split(' ')[0];
  const what = state.company.oneLiner || state.company.name;
  const B = buyerFor(state, k);
  if (!tpl) {
    return { senderName: `${first} ${last}`, senderRole: a.label, senderCompany: 'Independent', senderEmail: `${first.toLowerCase()}@gmail.com`, subject: state.company.name, message: `Hi ${founderFirst}, quick question about ${state.company.name}.`, hiddenAgenda: `${a.label}; true outcome: ${inb.outcome}` };
  }
  const facts = publicFacts(state);
  const co = fill(choose(`${k}:co`, tpl.co), { LAST: last });
  const v = { F: founderFirst, C: state.company.name, W: what, ME: first, me: first.toLowerCase(), CO: co, B, LAST: last, ROUND: facts.funding?.label ?? 'round' };
  let body = fill(choose(`${k}:body`, eligible(tpl.body, facts)), v);
  const good = GOOD.has(inb.outcome);
  const r = unit(`${k}:tell`);
  if (!good && tpl.tell.length && r < TELL_SHARE.bad) body += ` ${fill(choose(`${k}:t`, tpl.tell), v)}`;
  else if (good && tpl.good.length && r < 0.7) body += ` ${fill(choose(`${k}:g`, tpl.good), v)}`;
  else if (good && tpl.tell.length && r > 1 - TELL_SHARE.good) body += ` ${fill(choose(`${k}:t`, tpl.tell), v)}`; // a genuine sender with a misleading tell
  const domain = co === 'gmail.com' || !co || /^(a|an|your|the|ex-|angel|scout|independent|self-employed|freelance)\b/i.test(co) ? 'gmail.com' : `${co.toLowerCase().replace(/[^a-z]/g, '').slice(0, 18) || 'mail'}.com`;
  const subject = a.category === 'friend' || inb.channel !== 'email' ? '' : fill(choose(`${k}:s`, tpl.subj), v) || state.company.name;
  // Backstop: no sentence may claim news the company never made public (core/public-facts.js).
  const { scrubbed, ...msg } = scrubInbound(state, { senderName: `${first} ${last}`, senderRole: a.label, senderCompany: co, senderEmail: `${first.toLowerCase()}@${domain}`, subject, message: body, hiddenAgenda: `${a.label}; true outcome: ${inb.outcome}` }, facts);
  return msg;
}

// ---- Offline replies once the founder answers ----
const ASKS_CALL = /\b(call|chat|meet|zoom|time|calendar|book|slot)\b/i;
const ASKS_DETAIL = /\b(who|what|which|how many|how much|price|pricing|cost|budget|timeline|when|example|case stud|references?|clients?|numbers?)\b|\?/i;
const DECLINES = /\b(not interested|no thanks|no, thanks|pass|unsubscribe|remove me|not a fit|not right now)\b/i;

/** Offline reply from an inbound sender, in their archetype's voice, reacting to what the founder wrote. */
export function offlineNetworkReply(state, inb, a, founderMsg) {
  const k = `${inb.id}:${inb.engaged}`;
  const m = String(founderMsg ?? '');
  const asksCall = ASKS_CALL.test(m), asksDetail = ASKS_DETAIL.test(m), declines = DECLINES.test(m);
  const good = GOOD.has(inb.outcome);
  const engaged = inb.engaged;
  if (declines) return { reply: good ? choose(k, ['Understood, thanks for the quick answer. If it changes, you know where I am.', 'No problem at all. Good luck with it.']) : choose(k, ['Totally understand! I will check back next quarter.', 'No worries. Mind if I follow up in a month or two?']), wantsCall: false, outcomeReady: true };
  if (inb.outcome === 'scam') return { reply: choose(k, ['Great, glad you are in. To confirm your spot we just need the fee by Friday; I can send the invoice now.', 'Perfect. The next step is a quick form and the processing fee, then we move fast.']), wantsCall: false, outcomeReady: engaged >= 1 };
  if (!good) {
    // Worthless senders answer specific questions vaguely and steer to a call or a package.
    const vague = asksDetail ? choose(k, ['Every client is different, so it is easier to explain live.', 'Great question! It really depends; I can walk you through it on a quick call.', 'We have worked with many companies like yours; happy to share more on a call.']) : choose(k, ['Thanks for getting back to me!', 'Appreciate the reply.']);
    return { reply: `${vague}${engaged < 1 ? ' What does your week look like?' : ' Let me know if anything changes!'}`, wantsCall: engaged < 1 && (asksCall || a?.category === 'vendor' || a?.category === 'spam'), outcomeReady: engaged >= 1 };
  }
  // Genuine senders answer what was asked with something concrete, and only push for a call when it helps.
  const concrete = {
    customer_lead: 'Today it is spreadsheets and a lot of copy-paste; two people on my side would use it daily.',
    intro_customer: 'I know a couple of people who deal with exactly this; let me ask one of them if they would talk to you.',
    intro_investor: 'I know an investor who looks at this space; if you send me a short blurb I can forward it.',
    investor_meeting: 'We write first checks of $250k-$1M; a partner would want to see how your first customers found you.',
    intro_partner: 'We have shared customers asking for this; I can bring our partnerships lead into a thread.',
    press: 'I can take answers by email: what problem you saw first-hand, and one customer story I can name.',
    hire: 'I am looking for something early-stage; happy to do a short paid trial so you can see my work.',
    advice: 'I went through something very similar at my last company; happy to tell you what we got wrong.',
  }[inb.outcome] ?? 'Happy to share more.';
  const reply = asksDetail || engaged >= 1 ? `${concrete}${asksCall ? ' A call works too, pick a slot.' : ''}` : `Thanks for the reply. ${concrete} Easier live if you have 30 minutes.`;
  return { reply, wantsCall: asksCall || (!asksDetail && engaged < 2), outcomeReady: engaged >= 2 };
}
