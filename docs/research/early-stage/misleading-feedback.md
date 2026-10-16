# How customer feedback misleads early-stage founders

Purpose: give the simulator's LLM-played prospects realistic ways to mislead, and realistic ways to give true signal. Items marked [unverified] could not be confirmed against a primary source in this pass. Items marked [design] are game assumptions, not statistics.

Source notes: Mom Test and Steve Blank material is taken from book summaries and reviews, not the books. NN/g pages were not retrievable directly, so NN/g points come from secondary sites that cite them.

## 1. Talking to the wrong people

**Non-buyers and people without the problem.** Feedback from people with no budget or no pain is cheap to get and useless for sales. The Mom Test's core rule is to talk about the customer's life rather than your idea, and to ask about specifics in the past rather than opinions about the future ([mtlynch.io book report](https://mtlynch.io/book-reports/the-mom-test/)).
- Transcript: "Oh yes, we'd love something like that, our team is always drowning in reports." Follow-up: "When was the last time that happened?" Answer: "Honestly, I can't remember, it's not really a priority." The enthusiasm was for the idea, not the problem.

**Politeness from friends, family and warm networks.** Social desirability bias pushes respondents to overreport approved attitudes and underreport disapproved ones. Krumpal's review (Quality & Quantity, 2011) documents this and notes that interviewer characteristics and survey design change its size ([Krumpal 2011, doi:10.1007/S11135-011-9640-9](https://www.doi.org/10.1007/S11135-011-9640-9)). A practitioner guide adds that face-to-face interviews amplify it ([CASRAI](https://casrai.org/psychology-research/social-desirability-bias)), though that point is not from a meta-analysis.
- Transcript: "Totally, I'd definitely pay for this." Friend has never checked a competitor or asked for a discount.

**Other founders and investors.** They give strategic opinions ("the market is huge", "you should add an API") that reflect their own theses, not the buyer's budget. Treat them as a second opinion, never as a customer. [design]

**Enthusiasts and tinkerers.** People who like trying tools, join beta lists, and give long feedback often never pay. Dropbox's 2008 demo video drew a waiting list that jumped from about 5,000 to 75,000 in a day, per Drew Houston's own account in the Lean Startup deck ([Dropbox Startup Lessons Learned slides](https://www.slideshare.net/vishaltx/dropbox-startup-lessons-learned-16991502)). The list was real demand signal, but the sign-up count alone is not purchase signal. The date of the jump is inconsistent across sources (March vs April 2008) [unverified].
- Transcript: "This is so cool, I'm signing up for the beta and I'll tell my team." Player asks: "Would you put your card down today?" Answer: "Let me see how the beta goes."

**The one loud big customer (overfitting and the custom-feature trap).** A single large account asks for idiosyncratic features, and the roadmap bends to it. Founder guidance is consistent: it is a services project wearing a product costume; a test is whether the feature would be used unchanged by at least three other customers, and whether the product could handle 100 such customers without human effort ([echai.ventures summaries](https://echai.ventures/startingup/ship-iterate/how-do-i-set-a-roadmap-when-half-my-revenue-comes-from-one-big-customer-who-keeps-asking-for-custom-features)). A cited cautionary essay describes a company where one customer reached about 80% of revenue, the product bent to its demands, and the company collapsed when that customer's funding dried up (secondary citation of Sam McAfee's essay [unverified]).
- Transcript: "We'd buy the whole platform if you built SSO with our legacy ERP connector." Player builds it. Two months later the customer renegotiates and nobody else asks for the connector.

**Consultants and agencies.** They want custom builds and repeatable deliverables for their own clients, and they describe the demand as "a product for us". [design; no quantified source found]

**Wrong segment.** Pain is real but lower for the segment you interviewed. A mid-market controller and a five-person startup can both complain about spreadsheets while only one will pay.

## 2. Asking the wrong way

**Hypotheticals.** "Would you use this?" invites an opinion about a future self. The Mom Test explicitly says not to ask whether the customer would hypothetically use your product ([mtlynch.io](https://mtlynch.io/book-reports/the-mom-test/)). NN/g's guidance, as summarized by secondary sites, is to watch what users do rather than what they say ([NN/g video "We Like to Watch"](https://www.nngroup.com/videos/we-like-to-watch/)).
- Bad: "Would you use an AI tool that writes your weekly report?" Answer: "Oh definitely."
- Better: "Walk me through how you wrote last week's report. What took the longest?"

**Leading questions.** The question contains the answer. Secondary summaries of NN/g's Amy Schade describe leading questions as putting the desired answer into the question, and participants echo it [unverified; see echai.ventures summary of NN/g]. A transcript example: "Wouldn't it be nice to have one dashboard for all your metrics?" Answer: "Yeah, that would be nice."

**Pitching instead of listening.** The founder talks for most of the call. The Mom Test rule is "talk less and listen more" ([mtlynch.io](https://mtlynch.io/book-reports/the-mom-test/)). [design: the simulator should penalize talk ratio]

**Asking for feature ideas.** "What features would you want?" produces a wish list that correlates weakly with what gets used. Pendo's Feature Adoption Report (2019) estimated, from usage data across 615 subscriptions, that about 80% of features in an average product are rarely or never used ([Pendo 2019 report](https://www.pendo.io/resources/the-2019-feature-adoption-report/)). This is vendor data from a vendor selling adoption analytics; treat it as directional. A related Pendo post found about 80% of click volume came from about 12% of features ([Pendo blog](https://www.pendo.io/pendo-blog/pendo-data-suggests-29-5-billion-global-cloud-rd-investment-squandered-software-features-go-unused/)).

**Future behavior.** "I'll definitely check this every week." The intention-behavior gap is large. Prestwich, Sheeran, Webb and Gollwitzer (2015) report intentions explaining about 28% of the variance in behavior across 422 studies ([Prestwich et al. 2015 PDF](https://bpb-us-e1.wpmucdn.com/wp.nyu.edu/dist/c/6235/files/2019/02/prestwich-et-al-2015-implementation-intentions.pdf)). Webb and Sheeran (2006) found that a medium-to-large change in intention (d = 0.66) produced a smaller change in behavior (d = 0.36) across experiments [secondary summary; primary is Psychological Bulletin 2006 [unverified]]. The "53%" figure sometimes quoted for this gap could not be confirmed.

**Stated willingness to pay.** Hypothetical bias is real but its size depends on the study. Murphy, Allen, Stevens and Weatherhead (2005), a meta-analysis of 28 stated-preference studies, found 83 observations with a median hypothetical-to-actual WTP ratio of 1.35, with severe positive skew. Choice-based elicitation reduced the bias ([Murphy et al. 2005, Environmental and Resource Economics](https://ideas.repec.org/a/kap/enreec/v30y2005i3p313-325.html)). A later review cites a mean ratio around 2.6 in the same literature, and List and Gallet (2001) a roughly threefold gap [secondary; unverified]. Practical reading: stated WTP overstates real WTP by roughly 35% in the median and can exceed 2x in the tail. Juster's 1966 work on purchase probabilities found that stated intentions track actual purchase poorly unless calibrated [NBER, Juster 1966](https://www.nber.org/chapters/c1535.pdf). A practitioner summary says intent overstates absolute purchase rates most sharply for new and expensive products [unverified].

**Price questions without commitment.** "Would you pay $49?" gets a yes that does not convert. The Mom Test's better question is how much the problem costs them now ([mtlynch.io](https://mtlynch.io/book-reports/the-mom-test/)).

**Compliments and vague praise.** "This is really cool." Not signal. Compliments are the most common false positive in early interviews. [design]

**Generic vs specific answers.** "We usually struggle with reporting" is generic. "On Tuesday I spent three hours rebuilding the ad-spend sheet and my manager asked why it was late" is specific. The simulator should reward the second and punish the first.

## 3. Good signal

**Specifics of past behavior.** "Talk me through the last time that happened" anchors the conversation in a real event. Mom Test rule: ask about specifics in the past instead of generics or opinions about the future ([mtlynch.io](https://mtlynch.io/book-reports/the-mom-test/)).

**Current workarounds and their cost.** Money or hours already spent on a workaround is the strongest signal of a real problem. Ask: what have you tried, what did it cost, who else knows about it. The Mom Test lists "what else have you tried?" as a question that reveals how much someone cares ([supersummary summary](https://www.supersummary.com/the-mom-test/summary/)).

**Budget already allocated.** A line item, a contractor already hired, a tool already paid for. Stated budget ("we might have some money next year") is weak.

**Who else is involved in buying.** Buying groups are large. Forrester's 2025 research, as summarized by secondary sources, reports about 13 internal and 9 external stakeholders in a typical B2B purchase [unverified; verify against Forrester]. Gartner-attributed figures in secondary sources range from 5 to 11 stakeholders for enterprise groups, and the sources conflict [unverified]. A founder who interviews only the end user will not learn who can block the deal. [design: model 3-6 stakeholders for mid-market; more for enterprise]

**Emotional intensity.** Specific frustration ("I cried at my desk") versus mild annoyance. Intensity is the signal, not the adjective. Bob Moesta's switch-interview method (Jobs to Be Done) builds a timeline from the first thought to the purchase, surfacing the push, pull, anxiety and habit forces behind a switch ([Business of Software talk](https://businessofsoftware.org/talks/understanding-your-customer-jtbd/); [Lenny's Newsletter episode](https://www.lennysnewsletter.com/p/the-ultimate-guide-to-jtbd-bob-moesta)).

**Commitments.** The only real validation in the Mom Test framing. Commitment means the customer gives up something they value: time (a follow-up meeting on the calendar), reputation (an introduction to a decision-maker), or money (a letter of intent, deposit or pre-order). "The only way to fail is by not asking for any commitment from the customer" ([mtlynch.io](https://mtlynch.io/book-reports/the-mom-test/)). A rejected request is still useful data. [design: commitment tiers should map to conversion odds the player can see]

**Landing-page and fake-door tests.** The Dropbox example shows a demand test: a video landing page drove sign-ups from early adopters, which was a pass for the team at that stage [Launch Tomorrow analysis, unverified]. Paid ads on the same funnel did poorly. Channel quality matters as much as the signal.

**Pattern across interviews.** Use at least 5 in one segment. Look for the same specific pain in different words, and look for disconfirming evidence: the interview where nobody cared is as important as the ones where everyone did. [design; the "5 in a segment" threshold is practitioner convention, not a study]

## 4. Synthesis pitfalls

**Confirmation bias.** Researchers probe the answers that match their view and drop the rest. NN/g's definition, as quoted by secondary sites, describes analysis matched to existing beliefs ([unverified citation]).

**Anchoring on early interviews.** The first three calls set the frame for everything after. Track when each insight first appeared and whether later interviews confirmed it.

**Counting votes for features.** "Seven people asked for export" is a count of asks, not a count of need. Weight by specificity, commitment, and whether the problem is frequent and costly.

**Averaging across segments.** A mean satisfaction score across a freelance designer segment and an enterprise segment describes no real customer. Segment first, then synthesize within each.

**Feature requests vs jobs.** A request is a proposed solution. The underlying job is what matters. Torres's opportunity solution tree maps desired outcome, then opportunities (customer needs and pains), then candidate solutions, then assumption tests ([Continuous Discovery Habits summaries](https://scottburleson.substack.com/p/book-summary-continuous-discovery)). Torres also recommends weekly customer contact by the product team, and grounding interviews in past stories rather than hypotheticals (secondary summaries [unverified]).

**Pain x frequency x willingness to pay.** A practical prioritization: a problem that is frequent, costly, and has a budget owner beats one that is loud. [design]

**Blank's "get out of the building."** Customer development: gather facts from outside rather than relying on internal opinion, in four stages (discovery, validation, creation, company building) ([Customer development, Wikipedia](https://en.wikipedia.org/wiki/Customer_development); primary: Blank, *The Four Steps to the Epiphany*).

**Y Combinator and Graham.** Graham's "The 18 mistakes that kill startups" lists not building something users want as the biggest mistake, and "Do things that don't scale" argues for recruiting early users by hand ([YC essay index](https://ycombinator.com/library/carousel/Essays%20by%20Paul%20Graham)). The primary essays were not fetched in this pass; wording is from the index and secondary sources.

## 5. Quantified context

**Why startups fail.** CB Insights' post-mortem analysis is usually cited as "no market need" at about 42% of failures across roughly 100 to 110 startups (2017; secondary sources disagree on sample size) ([LaunchRock summary](https://www.launchrock.com/library/expert-advice/why-do-startups-fail); [CMO Council](https://cmocouncil.org/expert-views/cmo-blog/define-the-need-before-you-bleed-marketing-rigor-can-reduce-start-up-failure)). A newer CB Insights post (March 2026, 431 VC-backed shutdowns since 2023, 385 with reasons) lists "poor product-market fit" at 43% and "ran out of capital" at 70%, with reasons not mutually exclusive [CB Insights 2026](https://www.cbinsights.com/research/startup-failure-reasons-top/); the full ranking is in a chart not captured in text [unverified]. Use "35-43% cite lack of market need or PMF" as the range, and mark the source year.

**Premature scaling.** Startup Genome's 2011 report, as summarized by Steve Blank, said 74% of high-growth internet startups fail from premature scaling ([Blank on Startup Genome](https://steveblank.com/2011/08/29/it%E2%80%99s-not-how-big-it-is-%E2%80%93-it%E2%80%99s-how-well-it-performs-the-startup-genome-compass/amp/)). The sample and the 74% framing vary across secondary sources; treat as dated [unverified].

**Net Promoter as a say-do example.** Keiningham et al. (Journal of Marketing, 2007) tried to replicate Reichheld's Net Promoter claims in Norwegian data and did not confirm the claimed superiority ([JM 2007 summary](https://measuringu.com/article-summaries/a-longitudinal-examination-of-net-promoter-and-firm-revenue-growth/)). One vendor-cited figure says only 13% of customers who said they would recommend actually did [COLLOQUY, unverified].

**Acquiescence.** Yes-saying is common. Baumgartner and Steenkamp (2006) are cited as calling acquiescence the most prevalent response bias in survey research [secondary; unverified]. Hill and Roberts (Political Analysis, 2023) found wording-driven acquiescence could inflate estimated prevalence of some beliefs by up to about 50% ([Cambridge/Political Analysis](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/36461392CC22A6AC6813767D64490A64/S1047198722000286a.pdf/acquiescence-bias-inflates-estimates-of-conspiratorial-beliefs-and-political-misperceptions.pdf)). Effect size varies by sample and construct, so this is a design rule: ask questions whose "yes" costs the respondent something.

**Ford's "faster horses".** The line is not a verified Henry Ford quote. The Henry Ford museum says it has never been satisfactorily traced to him and appears only in the late 20th or early 21st century ([Henry Ford museum quotations](https://www.thehenryford.org/collections/explore/articles/henry-fords-quotations)). Use it, if at all, as a folk warning, not as evidence.

## Implications for the simulator [design]

- Prospects should respond to questions about the past with specifics that vary by segment and by how much pain they have. Generic future questions produce polite, unspecific answers.
- Hypothetical and "would you use" questions should produce enthusiastic yeses with low conversion. Commitment requests should be the only path to a high-confidence signal.
- Friends and warm contacts should be more polite than strangers, and enthusiasts should sign up without paying.
- A single large account should offer custom asks and a large revenue share, with a cost in roadmap and concentration risk.
- Interviews with the same segment should yield converging specifics. Different segments should diverge.
- Stated WTP should be discounted by a realistic hypothetical bias factor (median around 1.35x in the Murphy meta-analysis, with a tail). [design]
- Commitments (intro, pilot, LOI, pre-order) should be the only evidence that moves the market-validation meter strongly. [design]

## Open items

- Pull the Mom Test book text for exact wording on commitment; current quotes are from a review.
- Pull the NN/g articles on leading questions and on say-do gaps.
- Verify the CB Insights 2026 full ranking from the chart.
- Verify Forrester 2025 buying-group numbers and the Gartner stakeholder figure from primary sources.
- Confirm Webb and Sheeran (2006) effect sizes from the Psychological Bulletin paper.
