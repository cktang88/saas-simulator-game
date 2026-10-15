# Email reply times by sender type (checked 2026-10-15)

Used by `public/core/mail.js` (`REPLY_DELAY`, `replyDay`). Sourced numbers are marked [S]; everything else is a
[design] estimate. Almost all sources are vendor blogs, so the numbers are directional only.

| Sender | Model median / p90 | Basis |
|---|---|---|
| Vendors, agencies, salespeople | ~1h / 0.6 day, weekends normal | [design] sequences and SDRs reply within minutes |
| Job candidates | ~5h / 2.5 days | [S] Noon: 4.7h median from the triggering message, 2.7 days from first contact (135,938 replies) |
| Customers | ~7h / 2 days | [design] SMB within hours, enterprise about a business day; few weekend replies |
| Other founders, partners | ~half a day / 3 days | [design] |
| Prospects (cold outbound replies) | ~0.8 day / 3 days, weekdays | [S] Lemlist via Prospeo: about 90% of replies come within two days of a send; [S] 3-7-7 cadence captures ~93% of replies by day 10 |
| Investors (warm) | ~1 business day / 4 days | [design]; [S] only reply *rates* found (warm 50-80%, cold 1-5%) |
| Lawyers, CPAs | ~1 business day / 3 days | [design] |

General email: [S] Kooti et al. 2015 (Yahoo, arXiv:1504.00704, via TechXplore/MIT Tech Review press): replies,
when they come, mostly arrive within the hour; ~90% of replied-to mail is answered within a day or two. The
"~47 minutes" median circulates only in secondary press.

Sources
- https://arxiv.org/abs/1504.00704 and https://techxplore.com/news/2015-04-extensive-email-behavior.html
- https://www.noon.ai/blog/articles/334-candidate-response-time-recruiter-emails
- https://prospeo.io/s/when-to-send-follow-up-email (2026)
- https://belkins.io/blog/sales-follow-up-statistics (2026)
- https://instantly.ai/blog/follow-up-emails-vs-no-followup/
- https://time.com/3636042/email-replies/ (Yesware, about 2014: weekend mail answered 46% vs 39% weekdays)
- https://www.metal.so/collections/warm-intros-vs-cold-email-2025-conversion-data-referral-playbook

Not found: published investor, lawyer/CPA, agency or procurement reply-time data.
