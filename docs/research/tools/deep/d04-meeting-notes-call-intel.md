# D04: Meeting notes and call intelligence (Granola, Fathom, Gong)

Research date: 2026-10-14. Primary sources were fetched where possible. Items marked [unverified] rest on secondary sources only. Items marked [design] are my estimates for the simulator.

Summary of confidence: Granola and Fathom pricing and integration tiers were read from their own pages, but the pages are vague about CRM tiers. Gong publishes no prices at all. Accuracy numbers are mostly vendor claims or single third-party tests.

---

## 1. Granola

**Summary.** Granola is a bot-free AI notepad for Mac, with Windows and mobile apps. It captures system audio locally, so no bot joins the call. It writes "enhanced" notes by merging the user's typed jottings with the transcript, using a chosen template. It is used mainly by founders, sales reps and consultants who want notes without a recording bot. Its 2026 positioning is a personal notes tool that becomes a team and CRM tool at the Business tier. Pricing (granola.ai/pricing, accessed 2026-10-14): Basic is $0 per user per month, with a 30-day history window, note templates, shared folders and no integrations. Business is $14 per user per month, adding unlimited history, advanced integrations (HubSpot, Attio, Notion, Affinity, Zapier), API access, MCP, pre-meeting briefs and follow-up emails. Enterprise is $35 per user per month, adding SSO/SCIM, HIPAA workspaces and Salesforce. Paid tiers bill monthly only [per Granola pricing page; secondary sources agree].

**Data model.**
- Meeting (note): title, start time, attendees (name and email), raw transcript (speaker-labeled), the user's typed notes, enhanced notes, the template used, visibility (Private or shared), and sharing status to each CRM.
- Folder: a container for meetings. Folders can be shared with the team and can carry an auto-share rule to HubSpot.
- Template: a named structure for enhanced notes, such as a sales discovery template. Templates are customizable on all tiers.
- Recipe: a saved prompt run against one meeting or across many, invoked with "/" in Granola Chat. Shareable. [unverified: launch reported Oct 1, 2025 via third-party news sites only.]
- Chat thread: a question across meetings, scoped to one or more notes.
- Integration target: HubSpot contact, company or deal record; Attio; Affinity; Notion; Zapier path.

**Main workflows.**
1. Setup. Install the Mac app, sign in with a Google Workspace or Microsoft 365 account (the HubSpot path requires one; personal Gmail is not supported for it), grant microphone and system audio permissions, pick a default template. Free tier starts immediately with no bot to add.
2. Start a meeting. Click New Note or open the calendar entry, then type shorthand notes during the call. The transcript builds live beside the notes. No bot appears in the call.
3. Enhance. After the call, the note is generated in the chosen template. The user can read the enhanced notes and the raw transcript side by side and edit either. Notes must be generated before they can be shared.
4. Recipe run. In Granola Chat, type "/" and a recipe name, optionally scoped to one meeting or to a folder. Output lands as a chat answer. [unverified: exact UI.]
5. Share to HubSpot (per note). Click the HubSpot control at the top of the note, pick a contact, company or deal, and choose Meeting (default) or Note. Granola suggests records by matching attendee email addresses.
6. Folder auto-share. In a folder, turn on HubSpot under Integrations and pick target records. New notes added after enabling are shared. Existing notes are not backfilled; each must be shared by hand.
7. Weekly loop. Review the week's folder, run a cross-meeting chat ("what did we promise prospects this week?"), share the important notes, then check Settings > HubSpot for sync errors.
8. Aha moment. The founder finishes a call with clean enhanced notes already attached to the right HubSpot deal, with no typing afterward.

**Automation and AI.**
- Trigger: the meeting ends, or the user clicks Share. Folder auto-share is triggered on new notes only.
- AI: enhanced notes (template-driven summarization of transcript plus typed notes), chat across meetings, recipes, pre-meeting briefs and follow-up email drafts (Business).
- Human review points: the user edits enhanced notes and picks the HubSpot record before anything is sent. Folder auto-share removes that review point.
- Accuracy: no published word error rate or hallucination benchmark. Reviewers call transcripts highly accurate [unverified, review sites with affiliate links].

**Time saved and impact.** [design] Solo founder: 2 to 4 hours per week saved on note writing and CRM logging, mostly from skipping after-call write-ups. Cost: $14 per user per month on Business, about $168 per year per seat. No credit metering is published, so cost is flat per seat.

**Failure modes.**
- Remote meetings can be harder for bot-free capture; a review reports limits [unverified].
- Notes not backfilled; old notes must be shared one at a time (documented).
- Private notes cannot be shared (documented).
- Matching by email: if the Granola account and HubSpot account use different emails, nothing syncs. If no record matches, no data is created in HubSpot (documented).
- The native HubSpot push posts a note to the activity timeline; field-level custom properties need Zapier (documented). Users expecting field writes get disappointed.
- Mobile: iPhone users must share from macOS or Windows (documented).
- Plan gating: free users lose history beyond 30 days and get no CRM link.

**Integrations.** HubSpot (native, Business), Attio, Affinity, Notion, Zapier (Business), Slack, Salesforce (Enterprise only, per pricing page), MCP and API (Business).

**Sources.**
- https://www.granola.ai/pricing (fetched 2026-10-14)
- https://docs.granola.ai/help-center/sharing/integrations/hub-spot-sync (fetched 2026-10-14)
- https://www.granola.ai/blog/hubspot-meeting-notes-integration (search result, 2026-10-14) [secondary, vendor blog]
- https://techcrunch.com/?p=3052227 and https://alternativeto.net/news/2025/10/granola-adds-recipes-for-context-aware-ai-prompts-and-custom-workflow-personalization (recipes, Oct 2025) [unverified]
- https://skillscouter.com/granola-review/ (review, 2026) [unverified]

---

## 2. Fathom

**Summary.** Fathom is an AI meeting recorder for Zoom, Google Meet, Teams and others. It joins the call as a bot by default, with a bot-free beta option. It is popular with small sales teams because the free tier is generous and CRM logging is its main hook. Pricing (fathom.ai/pricing, accessed 2026-10-14): Free is $0 for individuals with unlimited recordings, instant AI summaries and clips. Premium is $20 per user per month ($16 annual) for individuals, adding advanced summaries, action items, a conversational assistant and a custom bot. Team is $19 per user per month ($15 annual) with a 2-user minimum, adding unlimited team meetings, playlists, comments, folders and global search, plus HubSpot connection for up to 3 users on Team. Business is $34 per user per month ($25 annual), 2-user minimum, adding CRM field sync, Deal View, coaching metrics and AI scorecards. Enterprise is sales-led.

**Data model.**
- Recording (meeting): title, date, duration, participants, video, audio, bot or bot-free capture mode.
- Transcript: speaker-labeled segments, editable by owners and editors. Speakers in shared-room recordings may need renaming (per third-party review).
- AI summary: a generated summary, with custom summaries on Business.
- Action items: generated tasks linked to the recording, with an owner where identifiable.
- Highlights and clips; playlists; folders; comments; keyword alerts.
- CRM link: contact, account or open opportunity in Salesforce, or contact, company or deal in HubSpot. Activity logged on each.
- Field mapping: AI-generated data points (for example budget, next steps) mapped to CRM fields. Field mapping is on Team and Business; HubSpot is fully supported; Salesforce field mapping is described as "rolling out" on the pricing or integration page.
- Deal View: all calls tied to one HubSpot or Salesforce deal, with an AI deal summary (Business).
- Ask Fathom: a conversational assistant across recordings.

**Main workflows.**
1. Setup. Sign up with Google or Microsoft. Connect the calendar. Choose bot or bot-free capture. Connect HubSpot or Salesforce in Settings > Integrations and authorize. On Team, HubSpot can connect for up to 3 users; on Business, Salesforce connects at the org level [per integration page].
2. Pre-call. Fathom adds the bot to scheduled calendar events automatically. The user can turn this off per calendar.
3. During the call. The bot shows in participants (bot mode). The user talks normally; a live transcript is available.
4. After the call. Within minutes, Fathom emails the summary and posts it to the CRM record, with action items. Free and Premium users read it in the app.
5. Review. Open the recording, check the summary and action items, rename speakers, edit the transcript if needed, and delete any wrong item. Fathom says CRM sync is automatic "no manual entry required."
6. Field mapping (Team/Business). Map a HubSpot field to an AI data point. The mapped field updates on each future matching call.
7. Deal View (Business). Open a deal to see every linked call in one timeline plus a rolling deal summary before a forecast call.
8. Weekly loop. Search across calls ("who asked about SOC 2?"), share a playlist of key moments with a teammate, and check action items.
9. Aha moment. The rep ends a demo, and the HubSpot deal already has a summary, next steps and a filled budget field.

**Automation and AI.**
- Trigger: calendar event start (bot joins), call end (summary and CRM push), and each matching call (field update).
- AI: summaries, action items, speaker labels, Ask Fathom, custom summaries, field-mapped data points, Deal View summaries.
- Human review: the user reads and edits summaries and transcripts. Automatic CRM writes happen without review once mapped; this is the riskiest step.
- Accuracy: vendor and third-party figures disagree. One review says 85 to 90 percent transcript accuracy. A March 2026 guide claims 90 to 95 percent in typical conditions. Toolworthy's test estimates about 87 percent in hard conditions (accents, jargon, overlap), which it says needs human review for decisions [unverified]. No independent hallucination-rate figure for action items was found.

**Time saved and impact.** [design] 3 to 5 hours per week for a solo founder who would otherwise write call notes and update CRM by hand. Cost: free for basic use; Team at $15 to $19 per user per month and Business at $25 to $34 per user per month, with a 2-user minimum on Team and Business. No credit metering published in the pages read.

**Failure modes.**
- Bot in the call: some prospects dislike a recorder joining; bot-free beta exists but is labeled beta (documented).
- Speaker attribution in shared rooms (third-party reviews).
- Links and notes posted in chat are lost from the record (a Capterra review, unverified).
- Gaps in CRM coverage: a user reports no Go High Level integration (Capterra review, unverified).
- Connection limits: HubSpot on Team is up to 3 users per domain (documented).
- Summary mistakes: when the summary says a next step that wasn't agreed, and field mapping writes it to the CRM. No published rate.
- Pricing confusion: sources disagree on which tier includes CRM field sync (Business per Fathom's page; some third-party sites say lower tiers). Check before buying.

**Integrations.** Zoom, Google Meet, Microsoft Teams, Calendar (Google, Outlook), HubSpot, Salesforce, Slack, Zapier and a public API and MCP (developers.fathom.ai, tier not stated on the page).

**Sources.**
- https://www.fathom.ai/pricing (fetched 2026-10-14)
- https://www.fathom.ai/integrations-crm (fetched 2026-10-14)
- https://sonix.ai/resources/fathom-pricing/ (2026) [secondary, competitor]
- https://www.toolworthy.ai/blog/ai-note-taking-software (accuracy test) [unverified]
- https://www.capterra.com/p/276054/Fathom/reviews/ (reviews, accessed 2026-10-14) [unverified]

---

## 3. Gong

**Summary.** Gong is a revenue intelligence platform that records and analyzes sales calls and emails, then builds deal boards, forecast boards, account boards and AI briefs on top. It targets mid-market and enterprise revenue teams. For a small team it is expensive and hard to justify, but it is the reference product in this category. Pricing: Gong publishes no prices (gong.io/pricing, accessed 2026-10-14). The page says licenses are priced per user, with a platform fee based on users supported, existing tech stack integrations are free, and team bands for quotes are 1 to 50, 51 to 1,000, 1,001 to 9,999 and 10,000+. Modules named: Engage, Forecast, Enable, Revenue Graph and AI. Third-party estimates (unverified, vary widely): roughly $1,300 to $1,900 per seat per year plus a platform fee of $5,000 to $50,000 per year; onboarding $7,500 to $65,000+; a 10-person team's first-year cost near $28,000 to $29,000. Forecast page lists Essentials (Deal Boards, Account Boards, AI Deal Reviewer, Win/Loss Insights, Deal Drivers) and a Forecast tier (forecast submission, AI Deal Predictor, Forecast Analytics, AI Revenue Predictor).

**Data model.**
- Calls: recording, transcript with speaker and topic trackers, scorecards, call brief.
- Emails and calendar events linked to contacts and deals.
- CRM objects synced: accounts, opportunities (deals), contacts, users, plus custom fields.
- Deal Board: a pipeline view of opportunities with stage, amount, close date, risk and an AI deal overview (Briefs tab) and Score tab for deal risk (per help docs).
- Account Board: accounts with health and expansion signals for CSMs and account managers.
- Forecast Board: one per line of business, each with a CRM user field, date field and amount field that select deals, plus forecast categories. Gong's help docs say categories are Gong-defined (Target attainment, Coverage, Commit, Best Case, Pipeline) and customizable by admins [one help article; verify].
- Brief type: a template made of sections, each with a question and optional instructions. Admins can create custom types.
- Briefs: account, deal, call and contact briefs, generated by AI Briefer.

**Main workflows.**
1. Setup (admin, weeks not hours). Connect the CRM (Salesforce or HubSpot), connect the calendar and email, install the recorder, and set user permissions. Gong's help center describes forecast board setup under Revenue > Forecast with "Manage forecast settings" permission.
2. Capture. Gong records calls automatically for connected users. Emails and calendar entries sync to deals and contacts.
3. Deal board review (manager). Open the deal board, filter by stage, check the risk score, and read the AI overview. Stalled or single-threaded deals are flagged.
4. Brief before a call (rep). Open the account or contact drawer, read the AI brief in the default type or switch type, and use it to prepare. Briefs draw on past calls, emails, CRM data and web information.
5. Forecast call. The manager opens the forecast board, reviews categories with dollar totals and deal counts, and tags key deals (Yes/No CRM field imported to Gong). Forecast submission and AI predictor run in the Forecast tier.
6. Coaching. Review call clips and scorecard results on the rep's calls, and leave comments on moments.
7. AI Deal Reviewer. The agent suggests deal updates and feedback, and per Gong's Forecast page it can update CRM fields automatically to remove manual entry (vendor claim).
8. Weekly loop. Manager reviews deal boards and forecast; reps check briefs and deal risk; CSMs watch account boards.
9. Aha moment. A manager sees a deal flagged as stalled with no champion on a call in the last 14 days, and the rep is already in a Commit or Best Case conversation about it.

**Automation and AI.**
- Triggers: call end (transcript and analysis), email and calendar sync, deal stage or activity change, scheduled brief refresh [refresh schedule not documented on the help page].
- AI: call transcripts and topic detection, deal risk score, AI Deal Predictor, AI Revenue Predictor (300+ signals per Gong's page), briefs via AI Briefer, AI Deal Reviewer.
- Human review: managers review forecast categories and deal risk; reps edit deals. The AI Deal Reviewer suggests updates before they write to CRM [Gong describes automatic CRM update, which implies some writes without review; treat as vendor claim].
- Accuracy: Gong says its predictor uses 300+ signals and gives "20% more precision than algorithms based on CRM data" (vendor claim). Forecast accuracy figures are customer quotes (one Upwork quote says 95 percent). No independent benchmark found. Briefer accuracy caveats are not documented on the help page.

**Time saved and impact.** [design] For a manager, 2 to 5 hours per week on forecast prep and deal reviews. Crayon's case study (vendor-published) reports 66 percent less time on forecast calls. For a solo founder: rarely worth it, since Gong's value depends on many reps and calls. Cost per unit: per seat plus platform fee; no credit metering in the sources read.

**Failure modes.**
- Cost: the platform fee dominates for small teams; renewals with 5 to 15 percent uplifts reported (unverified).
- Onboarding time: admin setup takes weeks; forecast boards need CRM fields correctly defined.
- Stale or missing CRM fields break forecast board selection (help docs say boards depend on the chosen user, date and amount fields).
- Recording consent: call recording law varies by jurisdiction; the admin must configure notices (general [design]).
- Briefs can be wrong or stale: no documented refresh cycle or accuracy caveats; treat as drafts.
- Forecast trust: one review notes some customers still don't trust the AI layer for board-level forecasting [unverified, reviewer inference].

**Integrations.** Salesforce and HubSpot (core), Google Workspace and Microsoft 365 (email and calendar), Zoom, Teams, Slack, Gong Revenue Graph; Clari is used alongside in some teams (unverified).

**Sources.**
- https://www.gong.io/pricing (fetched 2026-10-14)
- https://www.gong.io/forecast/ (fetched 2026-10-14)
- https://help.gong.io/docs/understanding-ai-briefer (fetched 2026-10-14)
- https://help.gong.io/docs/set-up-forecast-boards and https://help.gong.io/docs/understanding-configurable-forecast-boards.md (search results, 2026-10-14)
- https://www.raftlabs.com/blog/gong-pricing and https://www.sybill.ai/blogs/gong-pricing (pricing estimates, 2026) [unverified, competitor sources]
- https://docket.io/resources/research/gong-review (May 2026 review) [unverified]

---

## 4. Meeting to notes to CRM automation, and its accuracy

**Pipeline, as the three tools implement it.**
1. Capture. Granola: local system audio, no bot. Fathom: bot joins from the calendar by default. Gong: recorder attached to connected users' calls.
2. Transcribe. All three produce speaker-labeled transcripts. Accuracy claims: Fathom 85 to 95 percent depending on source; Granola "highly accurate" (no number); Gong not published.
3. Summarize. Granola uses user typed notes plus transcript in a template. Fathom generates a summary and action items. Gong generates call analysis and briefs.
4. Attach to a record. Granola matches attendee emails to HubSpot contacts, companies and deals; no record is created when nothing matches (documented). Fathom links to CRM contacts, accounts or open opportunities automatically once connected (documented). Gong links calls to accounts, deals and contacts from the CRM.
5. Write to the CRM. Granola posts note content to the HubSpot timeline (Meeting or Note); custom fields need Zapier. Fathom posts summaries and action items and, on Business, writes mapped fields on every matching call. Gong writes CRM fields via AI Deal Reviewer per its own claim.
6. Review. Granola: user edits and chooses the record before sharing; folder auto-share removes this gate. Fathom: user can edit after the fact, but mapped fields write automatically. Gong: managers review forecast and deal risk; write-back is the least transparent step.

**Where the automation breaks.**
- Wrong record: email mismatch between the meeting tool and the CRM (Granola documents this). Wrong contact on a multi-party call with a shared inbox.
- Wrong fields: AI data points such as budget or next steps get written when the call was ambiguous. No published error rate; the risk is highest for field mapping, which overwrites on each matching call.
- Missing data: links and notes shared in chat are lost (Capterra review, unverified). Granola does not backfill existing notes; Fathom needs integration set up before calls.
- Speaker errors: shared-room recordings mislabel speakers, so an action item can be assigned to the wrong person.
- Hallucinated next steps: no published rate found for any of the three. Treat AI action items as drafts until a human checks them. [design] For the simulator, a 5 to 10 percent rate of wrong or unsupported action items on noisy calls is a defensible default; this is an estimate, not a measurement.

**Accuracy summary.**
- Transcript: Fathom 85 to 95 percent (third-party and vendor, conflicting); Toolworthy hard-condition test about 87 percent [unverified]. Granola and Gong: no numbers.
- Matching: email-based matching works only when addresses match; no published match rate.
- Forecast: Gong vendor claims of 20 percent better precision and customer-quoted 95 percent forecast accuracy; no independent benchmark.
- Recommended simulator behavior [design]: show transcripts with 85 to 95 percent quality, a visible "needs review" flag on low-confidence fields, and occasional wrong-speaker or wrong-record events.

**Cost to a small team [design, 2026 list prices].**
- Granola Business: $14 per user per month.
- Fathom Team: $15 to $19 per user per month; Business $25 to $34 per user per month; 2-user minimum on paid team tiers.
- Gong: not published; third-party estimates put a 10-person team at roughly $28,000 to $29,000 in year one.

**Sources.**
- https://www.granola.ai/pricing (fetched 2026-10-14)
- https://docs.granola.ai/help-center/sharing/integrations/hub-spot-sync (fetched 2026-10-14)
- https://www.fathom.ai/pricing and https://www.fathom.ai/integrations-crm (fetched 2026-10-14)
- https://www.gong.io/pricing and https://www.gong.io/forecast/ (fetched 2026-10-14)
- https://help.gong.io/docs/understanding-ai-briefer (fetched 2026-10-14)
- https://www.toolworthy.ai/blog/ai-note-taking-software [unverified]
- https://www.capterra.com/p/276054/Fathom/reviews/ [unverified]
