# D10: Compliance automation (Vanta, Drata) and recruiting ATS (Ashby) - deep dive

Research date: 2026-10-14. Primary sources are vendor pricing pages, help centers and docs, accessed 2026-10-14 unless noted. Vendor-published performance numbers are labelled as vendor claims. [unverified] = secondary source only. [design] = my estimate for the simulator.

---

## 1. Vanta

**Summary.** Vanta is a continuous compliance platform that connects to a startup's cloud, identity, code, device and HR tools, runs automated tests against security settings, collects evidence, manages policies and personnel tasks, and hands an audit firm a request list. Its buyers are startups and scaling companies that need SOC 2 (often ISO 27001 or HIPAA later) for enterprise deals. Its 2026 positioning is "agentic" compliance: AI policy generation, AI questionnaire drafting, a public Trust Center with AI Q&A, and an MCP server that lets an AI tool read failing tests and propose fixes. Pricing is quote-only. The pricing page (vanta.com/pricing, accessed 2026-10-14) lists **Essentials** ("one compliance framework with agentic policy generator", Trust Center included), **Plus** (25 AI questionnaires/year), **Professional** (144 questionnaires/year, Advanced Trust Center, six customizable reports), and **Enterprise** (custom GRC). No prices or seat limits are shown. Third-party estimates put a SOC 2-only entry plan around $10,000/year and report renewal jumps (one example: $8,000 to $18,000 in year two) [unverified: underdefense/complyjet/knowlee aggregators, 2026]. Audit fees are paid to the auditor, not Vanta.

**Data model.**
- *Integration* (AWS/GCP/Azure, Okta/Google Workspace/M365, GitHub/GitLab, Jamf/Kandji/Intune, CrowdStrike/Tenable/Qualys, Workday/BambooHR/Gusto/Rippling, Jira/Asana/Linear). Has status, admin-permission prerequisites, and a resource-access scope.
- *Resource* (cloud asset, user, device, repo, vulnerability). Each can be scoped in or out of each framework ("Adaptive Framework Scoping").
- *Test* (automated 24/7 check of one setting, e.g. "MFA enabled"). Has pass/fail, the failing resources, and a remediation-task link.
- *Control* (framework requirement mapped to one or more tests and policies).
- *Policy* (template you edit, approval, employee acceptance, optional "enforced review" where staff must scroll to the bottom).
- *Personnel task* (policy acceptance, security training, Device Monitor install, background check) assigned via *group*. A person's tasks are the union of their groups' tasks; due dates come from SLA settings.
- *Evidence* item (file, screenshot or link), with a "ready for internal review" / "ready for audit" marker.
- *Audit* (created in the Audit Hub) with an *Information Request List* (IRL). Default request list auto-syncs evidence; a custom IRL is a CSV upload where each request is mapped to a framework code. Choosing the default list cannot be changed after the audit is created.
- *Auditor* user, granted to an audit engagement only.
- *Trust Center* page and *questionnaire* (uploaded or requested), with per-questionnaire quota by plan.

**Main workflows.**
1. **Setup and framework choice.** Sign-up, pick SOC 2 (or the framework your deals need), set company info, invite admins. Scope the framework using Adaptive Framework Scoping.
2. **Connect integrations in phases.** Vanta's guidance: phase 1 is cloud provider and identity provider (these "unlock the most automation"); phase 2 is MDM, version control and vulnerability scanner; phase 3 is HRIS and task tracker; phase 4 is specialized tools. Connect Slack or Teams only after the program is scoped, to avoid alert noise. Connecting an identity provider is not the same as enabling SSO. Results then appear in Assets > Inventory, Personnel > Computers, Personnel > Access, Personnel > People (access reviews), Assets > Code Changes and Assets > Vulnerabilities. Vanta does not publish how long first results take [design: minutes to hours].
3. **Triage failing tests.** The Tests view lists failing tests. Each failing resource shows the user, asset or config. Fix the cause (enable MFA, remove a stale account, link an Intercom account to a user or mark it as service account). If you want to exclude a resource, scope it out; scope changes can take up to an hour to propagate. Re-runs happen automatically; the control turns green once the test re-runs and evidence is present.
4. **Remediation with AI.** Connect an AI tool to the Vanta MCP server, list failing tests, and ask for a remediation plan with a suggested code change. Jira is the main task path: with read/write access, Vanta creates one Jira issue per failing test (not per resource).
5. **Policies.** Open the Policies page, use a template, edit it for your company (the AI policy generator is a plan feature), then assign for acceptance. A deleted policy can be restored from the library, which restores the default template.
6. **Personnel onboarding.** Add people, send the onboarding link (ready-made SOC 2 template email), and staff sign in, accept policies, install the Device Monitor and complete training. Security training has a built-in video library and is assigned per group; it recurs annually by default. Staff in a group see the union of its tasks.
7. **Trust Center and questionnaires.** Publish documents to the Trust Center. Buyers ask questions in a chat; the AI answers only from published resources and shows which resources it used. For a formal questionnaire, Vanta AI drafts answers from the Trust Center and approved content; a human approves each. Quota: 25/year on Plus, 144/year on Professional.
8. **Audit.** Invite the audit firm (Vanta submits a request to add the firm if it is not in the drop-down). Auditors get readiness access before fieldwork, and you choose whether they can test source data. Create an audit in the Audit Hub, choose default or custom IRL (upload CSV), then answer requests. Use "ready for audit" on evidence; an AI evidence evaluation can flag gaps against each request. The IRL feature is listed as Professional/Enterprise in one help version and as an add-on in another. Confirm with the account manager.

**Automation and AI.** Automated: continuous tests, evidence collection, employee reminders, policy and task assignment, Jira ticket creation, Trust Center publication. AI: policy generation, questionnaire drafting, Trust Center Q&A, evidence evaluation against auditor requests, the MCP remediation planner. Human review points: policy approval, every questionnaire answer, scope decisions, auditor sign-off, and any AI-remediated code change. Vendor claims: Vanta AI "automates over 80% of security questionnaire responses with up to a 95% acceptance rate" (Vanta release, June 2025) [vendor claim, unverified]. No independent accuracy data found.

**Time saved and impact.** [design] For a solo founder doing SOC 2 with Vanta, the pre-audit crunch is the big saving: manual evidence screenshots for ~100 controls would take weeks; with integrations, the bulk of evidence is automatic. Realistic: 3–6 hours/week during setup (weeks 1–6), 1–2 hours/week steady state, plus 2–4 hours per questionnaire without AI versus 20–40 minutes with an AI draft and review. Cost per unit: questionnaire quota (25 or 144/year), framework count, and employee count drive price.

**Failure modes.**
- Sandbox and test resources fail until explicitly scoped out. Scope changes lag up to an hour.
- Expired OAuth tokens make MCP or failing-test queries return nothing; re-authorizing usually fixes it.
- Automatic Jira ticket per failing test can flood a backlog (one per test, not per resource).
- Deleting a linked task does not change the test result; it only changes whether Vanta counts remediation as active.
- A control stays red after a fix until the test re-runs and evidence uploads.
- Integrations with no admin permission or service account fail to connect; license tier and network restrictions block some.
- Renewal escalators and add-ons (framework count, headcount bands at 20, 50, 100) raise cost [unverified].

**Integrations.** Cloud (AWS, GCP, Azure), identity (Okta, Google Workspace, Microsoft 365), code (GitHub, GitLab), device (Jamf, Kandji, Intune), vulnerability (CrowdStrike, Tenable, Qualys), HRIS (Workday, BambooHR, Gusto, Rippling), tasks (Jira, Asana, Linear), chat (Slack, Teams), support (Intercom). Public vendor page says "400+ tools" [vendor claim].

**Sources.**
1. https://www.vanta.com/pricing (accessed 2026-10-14). Plans and questionnaire quotas.
2. https://help.vanta.com/en/articles/15878233-integration-journey-what-to-connect-first-in-vanta (accessed 2026-10-14). Integration phases, result locations, scoping.
3. https://help.vanta.com/en/articles/15878326-determining-resource-access-for-your-integrations (accessed 2026-10-14, via search snippet).
4. https://developer.vanta.com/docs/quickstart/remediate-with-mcp (accessed 2026-10-14, via search snippet). MCP remediation.
5. https://help.vanta.com/en/articles/15461420-vanta-mcp-troubleshooting-and-faq (accessed 2026-10-14, via search snippet). OAuth issue.
6. https://help.vanta.com/en/articles/11345600-personnel-tasks and https://help.vanta.com/en/articles/11345901-personnel-onboarding-template-soc-2 (accessed 2026-10-14, via search snippet). Personnel tasks and onboarding templates.
7. https://help.vanta.com/en/articles/11345377-the-policies-page (accessed 2026-10-14, via search snippet).
8. https://help.vanta.com/en/articles/11345429-adding-and-managing-auditors and https://help.vanta.com/en/articles/12293647-information-request-list-irl-in-vanta (accessed 2026-10-14, via search snippet). Auditor and IRL.
9. https://www.vanta.com/resources/vanta-trust-center-enhanced-questionnaire-automation-ai (accessed 2026-10-14, via search snippet). Questionnaire AI.
10. https://www.businesswire.com/news/home/20250610126271/en/ (June 10, 2025). Vanta AI Agent launch and 80%/95% claim.
11. Pricing aggregators, [unverified]: https://underdefense.com/blog/vanta-pricing/ (2026); https://www.capterra.com/p/211459/Vanta/pricing/ (accessed 2026-10-14).

---

## 2. Drata

**Summary.** Drata is a continuous compliance and trust platform, the main competitor to Vanta. It targets startups through enterprise GRC. Its 2026 pitch is "continuous compliance" with Autopilot (automated tests run nightly and daily for custom tests), an AI questionnaire product (Drata AI, with Knowledge Base and "Agentic Questionnaire Response" in beta access), a Trust Center, and an Auditor Hub. Pricing is not public. The pricing page (drata.com/pricing, accessed 2026-10-14) shows no plans or prices, only "Contact Sales", and it describes solution tiers by company size: **Startup**, **Growth**, **Enterprise**. Third-party estimates disagree on plan names (Foundation, Essential, Advanced, Enterprise). CostBench indicates ~$7,500/year for an Essential plan up to 50 employees and ~$15,000/year for a Foundation plan [unverified, indicative only]. Vendr-based figures suggest a median of about $24,600/year (Orbiq) to about $38,000/year (UnderDefense) [unverified]. Audit, implementation and pen tests add 20–35% (Orbiq) or $40,000–$120,000 for first-year SOC 2 programs (BDEmerson) [unverified]. Custom connections and custom tests require Advanced or Enterprise.

**Data model.**
- *Connection* (identity provider, infrastructure, version control, ticketing, HRIS, background check, MDM). Ticketing creates remediation tasks when tests fail.
- *Framework* (SOC 2 etc.), with requirements and scope.
- *Control* (owner, approver, evidence, tests mapped to it). The Controls page shows scope, owners and approvers.
- *Test* (Autopilot automated check). Shows the failing person, asset or configuration. A "Test AI summary" is an optional feature.
- *Custom connection / custom test* (push JSON evidence, define a rule; runs daily).
- *Personnel* record (employment status from HRIS or identity provider), with internal security settings and background checks.
- *Policy* (Policy Center): create, approve, collect acknowledgements.
- *Questionnaire* with *Knowledge Base* answers. Approved answers are saved for reuse.
- *Trust Center* documents, gated by request.
- *Audit* and auditor access (help center collection "The Auditor Experience"; exact object names [unverified]).

**Main workflows.**
1. **Quick Start checklist (new experience; accounts created after Feb 24, 2026).** Admin-only. Five groups: (1) Basic info (Go to Company Info, Org info tab). (2) Connections: Identity, Infrastructure, Version control, Ticketing. (3) Continuous compliance: assign compliance roles (optional), Scope your framework requirements (opens Frameworks page, one card per enabled framework), Review gaps and plan remediation (opens Controls page). (4) Personnel: HRIS (optional), Verify employment status (Personnel page), Internal Security tab (Settings > Personnel Compliance), background checks (Human Resources tab). (5) Policies: Go to Policy Center. Completion is 100% when all required items are done; you can stop and resume. Classic-experience accounts (pre-Feb 2026) see six sections, including "Onboard your personnel to Drata".
2. **Connect and let Autopilot run.** Connect identity first, then infrastructure, then code. Tests run automatically, typically nightly sync; you do not press a button.
3. **Triage failing tests.** Click each failing test to see the non-compliant person, asset or configuration. Fix the setting. The next sync (typically nightly) updates status. Drata's pre-audit checklist targets 100% passing before the audit starts.
4. **Custom tests (Advanced/Enterprise).** Push evidence JSON from a tool Drata has no integration for, define the test, run daily. On failure, include or exclude resources and submit a reason.
5. **Policies and personnel.** Policy Center: create from templates, route approval, collect acknowledgements. Personnel: verify each employee's status, complete security training and background check tasks.
6. **Questionnaires with Drata AI.** Upload the questionnaire; the AI reads it and drafts answers from the Trust Center, Knowledge Base and approved documents. Reviewers approve, edit or reject. Edits feed back to the AI. Analytics show AI accuracy and completion rate. Approved answers are stored for reuse.
7. **Audit.** Grant the auditor access through the auditor flow in the help center; the pre-audit checklist covers scope, evidence and readiness.

**Automation and AI.** Automated: nightly sync and test runs, ticket creation on failure, personnel sync from identity and HRIS, Trust Center publication. AI: questionnaire drafting, test AI summaries, Agentic Questionnaire Response (beta). Human review points: every questionnaire answer, control approvals, policy approvals, exclusions of resources from tests. Vendor claims: "Saves 375+ hours per year" (drata.com product page) and "no hallucinations, no guesswork" (Drata blog, 2025). Both are marketing claims; no independent benchmark found.

**Time saved and impact.** [design] Similar economics to Vanta. Solo founder: 3–6 hours/week in the first 6–8 weeks of setup, then 1–2 hours/week. Questionnaire: 2–4 hours manually vs 20–40 minutes with AI draft and review. Drata's "375+ hours per year" is its own figure for a heavy questionnaire user.

**Failure modes.**
- Some tests always fail for a given setup. Example from the help center: GitLab Community Edition tests 8 and 9 fail due to license restrictions.
- Datadog requires both an AWS connection and an AWS-to-Datadog integration; partial setup yields red tests.
- Nightly sync means fixes take up to a day to show.
- Custom tests are not available below Advanced.
- Resource exclusions need a stated reason, which gets scrutinized at audit.
- AI questionnaire answers can be wrong when Knowledge Base content is stale; accuracy dashboards exist but the team must check them.
- Quote-only pricing, with add-ons; first-year total commonly exceeds the license quote [unverified].

**Integrations.** Identity (Google Workspace, Okta, Microsoft Entra), infrastructure (AWS, GCP, Azure), version control (GitHub, GitLab incl. self-managed), ticketing (Jira etc.), monitoring (Datadog), endpoint (CrowdStrike), HRIS and background checks. Help center lists "hundreds of tools" without names on the pricing page [vendor claim].

**Sources.**
1. https://drata.com/pricing (accessed 2026-10-14). No prices; Startup/Growth/Enterprise solution tiers.
2. https://drata.com/products/ai-questionnaire-assistance (accessed 2026-10-14, via search snippet). Drata AI workflow, approval, analytics.
3. https://help.drata.com/en/articles/13265650-quick-start-guide (accessed 2026-10-14). Quick Start steps.
4. https://help.drata.com/en/articles/13394100-enable-ai-summaries-for-tests (accessed 2026-10-14, via search snippet).
5. https://help.drata.com/en/articles/13401776-create-and-publish-custom-tests (accessed 2026-10-14, via search snippet).
6. https://help.drata.com/en/articles/12020733-pre-audit-checklist-how-to-prepare-for-your-audit-with-drata (accessed 2026-10-14, via search snippet).
7. https://help.drata.com/en/articles/9777474-gitlab-self-managed-integration-guide and https://help.drata.com/en/articles/6414118-datadog-connection (accessed 2026-10-14, via search snippet).
8. https://drata.com/blog/announcing-aiqa-1-million-questions-milestone (July 29, 2025). Vendor claim.
9. Pricing aggregators, [unverified]: https://www.costbench.com/software/compliance-management/drata/ (accessed 2026-10-14); https://www.bdemerson.com/article/drata-pricing (accessed 2026-10-14); https://underdefense.com/blog/drata-pricing/ (2026-08-17).

---

## 3. Ashby

**Summary.** Ashby is an all-in-one recruiting platform (ATS, CRM, scheduling, analytics, sourcing) built for in-house talent teams at growing startups. Its 2026 pitch is AI throughout the funnel: AI-Assisted Application Review, AI Talent Rediscovery, auto-scheduling, AI Notetaker (paid add-on) and Ashby Agents. Pricing (ashbyhq.com/pricing, accessed 2026-10-14): **All-In-One Foundations**, $400/month for up to 100 employees (10% annual discount), including 200 sourcing email lookups, 1,000 outbound SMS/month, 1 candidate survey, 1 offer template and 1,500 AI credits/month. **Plus** (101–1,000 employees) and **Enterprise** (1,000+) are "Get in Touch" priced, with per-seat AI credits (2,500 and 12,500/year). **Ashby Analytics** is usage-based for companies over 100 employees with an existing ATS. Add-ons: texting $90 per 1,000 messages on all plans, SSO $100/month, AI Notetaker, extra sourcing lookups. A third-party site claims a free plan under 10 employees [unverified, not on the pricing page].

**Data model.**
- *Job* (central role record, has hiring team, openings, interview plan and AI criteria). Shown on the careers site only when it is Open and has a published, listed *Job Posting*.
- *Job Posting* (public or internal ad, with syndication to job boards and an application form).
- *Application form* (shared or custom), with questions.
- *Candidate* (profile, applications across jobs, AI opt-out flag, legal-notice acknowledgement).
- *Application* (one candidate × one job), with stage (for example Application Review), Average Score (human only) and Evaluations.
- *Interview plan* (stages, each with activities). *Schedule Interview* activity has an interview type, feedback form, interviewer slots, communication tab, direct-booking and candidate-availability settings, reminders, and an optional stage-entry automation.
- *Feedback form* and *scorecard* (reviewers submit ratings and comments per interview).
- *AI criteria* (per job: up to 50 criteria, each *meets / does not meet / undecided*).
- *AI credit* (one evaluation of one candidate for one job consideration).
- *Agent* (Ashby Assistant, or saved custom agents; can be personal or shared).
- *Report* (Report Builder, with subjects such as Job Postings), dashboards such as the Interviews Dashboard.

**Main workflows.**
1. **Admin setup.** Admin > Organization Setup > Opt-In Features: turn on Enable AI Features, accept AI terms, enable AI-Assisted Application Review and Custom Agents. Set up interview types and shared feedback forms under Admin > Interviews & Scheduling > Interviews.
2. **Create and publish a job.** Creating & Opening Jobs. Create the job, add a posting, choose the application form, mark it Open. Syndication to LinkedIn, Indeed, Glassdoor, Built In and X Hiring is documented [unverified, search snippet of docs]. The public board or embed (full-page or application-form-only) is documented.
3. **Set up AI criteria (once per job).** Open Jobs > Jobs, select the job, AI Features tab, Set up criteria, then + Add criteria. Options: Add from # suggestions (AI suggests from the job posting), Add previously used, Add custom (title plus evaluation prompt). In Application Form Criteria, toggle Did the Application answer the question? for long text fields. Click Validate: Ashby flags unclear or EEO-risky criteria; you may proceed. Click Save and Evaluate all active candidates.
4. **Review applications.** On the Application Review page, add the AI Job Criteria Met Percentage column and sort. The Evaluations column summarizes results; hover for details. Use AI Criteria Quick Filter to filter by criterion and status, then bulk-act. Open a candidate's Feedback tab to see reasoning per criterion. Flag wrong results via the three-dot menu. The human Average Score is separate from AI results.
5. **Schedule interviews.** Open the job > Interview Plan > Add Activity to... > Schedule Interview. Schedule tab: Add Shared Interview (or create one for this activity), add interviewer slots (users or pool), set default room, timing (Advanced Scheduling Automation add-on or Enterprise). Communication tab: calendar, location (Google Meet, Teams, Zoom or phone), email and SMS templates. Direct Booking & Candidate Availability tab: minimum notice, increments, buffers, reschedule limits. Automation tab: Automate on Stage Entry chooses direct booking or availability link. Candidate picks a slot (single-event only) or submits availability, and the recruiter uses Manual Schedule.
6. **Scorecards.** Interviewers get a briefing page with schedule, candidate summary and the scorecard tab. Interviews Dashboard shows completion rate and completion by interviewer. Ashby reports ~84–89% average submission (Talent Trends) [vendor claim].
7. **Ashby Agents.** At-mention the Ashby Assistant or click Use Agent. Or create a custom agent with saved instructions and a schedule (daily, weekly, monthly, quarterly or custom); output goes to Slack and/or email. Write actions (create candidate, add note, move stage, draft email, fill feedback form) need your confirm; Reject stops them. Scheduled runs are read-only.
8. **Pipeline analytics.** Report Builder, Job Postings subject, Interviews Dashboard. Ashby's blog presents a dashboard built for internal mobility; funnel-conversion specifics not verified.

**Automation and AI.** Automated: AI criteria evaluation per candidate per job, Talent Rediscovery (ranks past candidates into priority buckets against job criteria), auto-scheduling with reminders, syndication, scheduled agents, AI Notetaker (paid add-on). AI does not rank or give numeric scores (per Ashby). Results are per criterion: meets, does not meet, or undecided. Human review points: criteria design and validation, every stage decision, candidate messages, interview feedback, and every write action an agent proposes. Accuracy: none published. The one vendor case: 1,500 resumes reviewed in 6 hours by a VP of People (Ashby blog, first-person, vendor-published, no error rates reported). Ashby itself says the AI "may be inaccurate, so review it before use."

**Time saved and impact.** [design] Solo founder or 1–2 person team hiring 2–4 roles: AI review plus criteria can cut resume triage from roughly 3–5 hours per role to 45–90 minutes including criteria setup. Scheduling automation saves 2–4 hours per candidate loop (coordination emails, rescheduling). Cost per unit: 1 credit per candidate per job consideration. The Foundations 1,500/month pool covers roughly 1,500 candidate-job evaluations; extra credits are bought in blocks. Texting is $90 per 1,000 messages beyond the plan's included count.

**Failure modes.**
- No resume and no Ashby profile: the AI has nothing to read for that criterion.
- Candidates who opt out of automated processing are skipped, with the reason shown. If "Hide Evaluations if a Candidate Hasn't Seen this Legal Notice" is on, evaluations hide for them. Candidates arriving via referral, manual add or the Chrome extension may not have seen the notice.
- Application form criteria only check whether a long text question was answered, not the quality of the answer.
- EEO warnings on criteria that the user ignores.
- AI results are not reflected in Average Score; teams who skip human scoring get no ranked decision.
- Direct booking cannot schedule multi-event loops; use availability links instead. Reschedule limits (0 blocks self-service) can frustrate candidates. Recruiter reschedules do not count.
- Scheduled agents cannot be edited by admins and are read-only; recipients cannot reply in Slack or email.
- Learning curve is the top G2 complaint; integration catalog smaller than Greenhouse [secondary, G2/review sites, 2026].

**Integrations.** Google Workspace (calendars, rooms), Microsoft Teams, Zoom, Google Meet, Slack and email (agent output), LinkedIn, Indeed, Glassdoor, Built In, X Hiring (syndication), Chrome extension for sourcing, Metaview [docs page exists], sourcing email lookup providers, HRIS for onboarding (People Workflows, add-on).

**Sources.**
1. https://www.ashbyhq.com/pricing (accessed 2026-10-14). Plan table, add-ons, AI credit pools.
2. https://docs.ashbyhq.com/ai-assisted-application-review (accessed 2026-10-14). Setup steps, statuses, limitations, credit definition.
3. https://docs.ashbyhq.com/setting-up-schedule-interview-activities (accessed 2026-10-14). Scheduling tabs and reschedule limits.
4. https://docs.ashbyhq.com/ashby-agents (accessed 2026-10-14). Agent triggers, actions, limits.
5. https://www.ashbyhq.com/blog/recruiting/ai-assisted-application-review-in-practice (accessed 2026-10-14). Vendor-published case, 1,500 resumes in 6 hours.
6. https://www.ashbyhq.com/ai (accessed 2026-10-14, via search snippet; older page). AI positioning.
7. https://www.ashbyhq.com/talent-trends-report/reports/recruiting-coordination and /ai-notetaking (accessed 2026-10-14, via search snippet). Scorecard completion rates. Vendor data.
8. https://docs.ashbyhq.com/job-board and https://docs.ashbyhq.com/creating-and-opening-jobs (accessed 2026-10-14, via search snippet). Job and posting model.
9. https://docs.ashbyhq.com/reporting-on-job-postings (accessed 2026-10-14, via search snippet).
10. Reviews, [unverified]: https://g2.com/products/ashby-ashby/reviews (accessed 2026-10-14, via search snippet; rating 4.7, 115 reviews).

---

## 4. Cross-cutting: SOC 2 timeline for a 1–5 person startup (Vanta/Drata path)

Sources are compliance-vendor and consultancy blogs, so treat ranges as approximate [unverified]: scrut.io SOC 2 timeline and type comparison (accessed 2026-10-14); wolfia.com SOC 2 requirements guide, March 2026 (accessed 2026-10-14, via search snippet); soc2auditors.org startup guide (accessed 2026-10-14, via search snippet). Design estimates for the simulator are marked [design].

| Phase | Duration (estimate) | What happens in the tool |
|---|---|---|
| Sign-up, scoping, integrations (phase 1: cloud, identity) | Week 1–2 [design] | Vanta integrations or Drata Quick Start; first tests appear |
| Remediation of failing tests and policies | Weeks 2–6 [design] | Fix MFA, access, logging; assign and accept policies; onboard staff |
| Readiness and tasks (training, device monitoring, access reviews) | Weeks 4–8 [design] | Personnel tasks, evidence on "ready for audit" |
| Type I fieldwork | 4–8 weeks once ready; total 3–6 months [unverified] | Auditor needs access before fieldwork; IRL requests |
| Type II observation window | 3–12 months, 6 most common first choice [unverified] | Tests must stay green; evidence continuous |
| Type II fieldwork and report | Total Type II 6–15 months from start [unverified] | Audit Hub requests, auditor sign-off |

Startup path noted by the same sources: many teams take Type I first to unblock deals and run the Type II window in parallel; about 70% reportedly skip Type I and go straight to Type II after a 3–6 month practice period [unverified]. Audit fees are paid to the auditor and are outside the Vanta/Drata license.

## 5. Simulator design notes [design]

- Core loop for both compliance tools: connect, triage failing tests (each red item has a specific resource), assign tasks to staff, and answer questionnaires with AI drafts that the founder must approve.
- Failure beats worth modelling: an unscoped sandbox failing, a stale OAuth token, a Jira ticket per test, a nightly sync delay (Drata), a candidate who opted out of AI review, and a scheduled agent that cannot write.
- Pricing: show quote-only pricing with third-party ranges clearly marked as estimates; Ashby's $400/month Foundations is the only published self-serve price in this set.
- Human-in-the-loop: every AI output (questionnaire answer, criteria evaluation, agent write action) should require an approve, edit or reject step.
