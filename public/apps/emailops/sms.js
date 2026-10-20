// SMS for login codes (OTP) and product alerts. A usage API (Twilio-style) where the work is carrier registration:
// US A2P 10DLC needs a registered brand and campaign (toll-free numbers need verification) before carriers deliver,
// and unregistered traffic is blocked. Cost is per SEGMENT: Unicode (an emoji, a curly quote) cuts a segment from 160
// to 70 characters, so a careless template doubles or triples the bill. OTP endpoints also attract SMS pumping (toll
// fraud) unless geo permissions and rate limits are set.
//
// Research: docs/research/tools/2026q4/dev-data.md §3 (Twilio US SMS ~$0.0079-0.0083/segment + carrier fees ~$0.003-0.005,
// all-in ~$0.011-0.013; numbers ~$1.15/mo local, $2.15 toll-free; 10DLC fees vary $4.50-60 by source; verification takes
// days to weeks; Telnyx cheaper [third-party]). Registration-day ranges, rejection odds, pumping odds and the share of
// signups lost to a missing code are [design]. The failed-message fee is [unverified].
// Deterministic: draws hash (seed, day, key); no rng stream, no Date.now / Math.random.

import { clamp, round2, hash } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { addRecurring, post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { activeSubs, ensureStripe } from '../../core/stripe.js';
import { ensureLifecycle, transactionalLoss } from '../lifecycle/model.js';

export const SMS_PROVIDERS = {
  twilio: { label: 'Twilio', perSeg: 0.0083, carrier: 0.004, number: 1.15, tollFree: 2.15, setupH: 1.5, note: 'US SMS ~$0.0083/segment + carrier fees ~$0.003-0.005 (all-in ~$0.011-0.013). Local number ~$1.15/mo, toll-free ~$2.15/mo. The best docs; Verify and fraud tooling built in [third-party].' },
  telnyx: { label: 'Telnyx', perSeg: 0.004, carrier: 0.004, number: 1, tollFree: 1.5, setupH: 2.5, note: 'Cheaper per message on its own network; thinner docs and fewer guides, so setup takes longer. Same 10DLC rules [third-party].' },
};
export const SMS = {
  brandFee: 4.5, vettingFee: 15, campaignMonthly: 10, // [third-party: fees vary $4.50-60 by source]
  regDays: [10, 21], tollFreeDays: [7, 28], // [design] "days to weeks"
  regHours: 1.5, templateHours: 0.25, fallbackHours: 1, geoHours: 0.5,
  failedFee: 0.001, // [unverified] per failed/blocked message
  otpPerSignup: 1.3, loginsPerAcctMonth: 0.6, alertsPerAcctMonth: 4, // [design]
  lostIfNoCode: 0.6, lostWithEmailFallback: 0.15, // [design] share of signups who give up when the code never arrives
  pumpingPerMonth: 0.06, pumpingUsd: [200, 5000], // [design] SMS pumping on an unprotected OTP endpoint
};
export const SMS_ITEMS = { optIn: 'How users opt in (screenshot or flow description)', privacy: 'Privacy policy link that covers SMS', samples: 'Sample messages with your brand name and STOP/HELP' };

const GSM = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
const h01 = (key) => (parseInt(hash(String(key)), 36) % 1000003) / 1000003;

/** Segments for one rendered message: GSM-7 160 chars (153 when split), UCS-2 70 (67 when split). */
export function segmentsOf(text) {
  const s = String(text ?? '');
  const gsm = GSM.test(s);
  const len = [...s].length;
  const one = gsm ? 160 : 70, part = gsm ? 153 : 67;
  return { gsm, len, segments: len <= one ? 1 : Math.ceil(len / part) };
}
export const renderSms = (state, tpl) => String(tpl ?? '').replace(/\{\{\s*brand\s*\}\}/gi, state.company?.name ?? 'App').replace(/\{\{\s*code\s*\}\}/gi, '483920');
export const DEFAULT_SMS = '{{brand}}: your login code is {{code}}. It expires in 10 minutes. Never share it. Reply STOP to opt out.';

export function smsSlice(state) {
  state.apps ??= {};
  const T = (state.apps.transactional ??= {});
  const S = (T.sms ??= {});
  S.provider ??= null; S.numberType ??= '10dlc'; S.useOtp ??= true; S.useAlerts ??= false;
  S.reg ??= { status: 'none', submittedDay: null, readyDay: null, items: {}, attempts: 0 };
  S.template ??= DEFAULT_SMS; S.emailFallback ??= false; S.geo ??= false;
  S.accrued ??= 0; S.billId ??= null;
  S.stats ??= { sent: 0, blocked: 0, segments: 0, cost: 0, lostSignups: 0, pumping: 0, extraSegCost: 0 };
  return S;
}
const today = (state) => state.day ?? 0;
const R = (ok, extra = {}) => ({ ok, hours: 0, ...extra });
export const registered = (S) => S.reg.status === 'approved';

export function setSmsProvider(state, id) {
  const S = smsSlice(state);
  const p = SMS_PROVIDERS[id];
  if (!p) return R(false, { error: 'Unknown SMS provider' });
  if (S.provider === id) return R(false, { error: 'Already in use' });
  const switching = Boolean(S.provider);
  S.provider = id;
  if (switching) S.reg = { status: 'none', submittedDay: null, readyDay: null, items: {}, attempts: 0 }; // registration lives with the provider account
  let r = (state.recurring ?? []).find((x) => x.id === S.billId);
  if (!r) { r = addRecurring(state, { vendor: p.label, amount: 0, category: 'software', dayOfMonth: 11, note: 'SMS number' }); S.billId = r.id; }
  r.vendor = p.label; r.amount = round2((S.numberType === 'tollfree' ? p.tollFree : p.number) + (registered(S) && S.numberType === '10dlc' ? SMS.campaignMonthly : 0)); r.active = true;
  return R(true, { hours: p.setupH * (switching ? 1.3 : 1) });
}
export function setNumberType(state, type) {
  const S = smsSlice(state);
  if (!['10dlc', 'tollfree'].includes(type)) return R(false, { error: 'Unknown number type' });
  if (S.numberType === type) return R(true);
  S.numberType = type; S.reg = { status: 'none', submittedDay: null, readyDay: null, items: {}, attempts: S.reg.attempts };
  // The number's monthly rent follows its type (was: switching to toll-free kept billing the cheaper local number).
  const p = SMS_PROVIDERS[S.provider];
  const r = p && (state.recurring ?? []).find((x) => x.id === S.billId);
  if (r) r.amount = round2(type === 'tollfree' ? p.tollFree : p.number);
  return R(true, { hours: 0.5 });
}
/** Submit 10DLC brand + campaign (or toll-free verification). Missing items raise the rejection odds. */
export function submitRegistration(state, items = {}) {
  const S = smsSlice(state);
  if (!S.provider) return R(false, { error: 'Pick an SMS provider first.' });
  if (S.reg.status === 'pending' || S.reg.status === 'approved') return R(false, { error: `Registration is ${S.reg.status}.` });
  const t = today(state);
  const [a, b] = S.numberType === 'tollfree' ? SMS.tollFreeDays : SMS.regDays;
  const days = Math.round(a + (b - a) * h01(`smsreg|${state.seed}|${t}|${S.reg.attempts}`));
  const clean = Object.fromEntries(Object.keys(SMS_ITEMS).map((k) => [k, Boolean(items[k])]));
  S.reg = { status: 'pending', submittedDay: t, readyDay: t + days, items: clean, attempts: S.reg.attempts + 1 };
  const fee = S.numberType === 'tollfree' ? 0 : SMS.brandFee + SMS.vettingFee;
  if (fee) post(state, { amount: -fee, counterparty: SMS_PROVIDERS[S.provider].label, description: 'A2P 10DLC brand registration and campaign vetting', category: 'software', method: 'card' });
  return R(true, { hours: SMS.regHours, days, usd: fee });
}
export function setSmsTemplate(state, text) { const S = smsSlice(state); S.template = String(text ?? '').slice(0, 480); return R(true, { hours: SMS.templateHours, seg: segmentsOf(renderSms(state, S.template)) }); }
export function setEmailFallback(state, on) { const S = smsSlice(state); S.emailFallback = Boolean(on); return R(true, { hours: on ? SMS.fallbackHours : 0.1 }); }
export function setGeoPermissions(state, on) { const S = smsSlice(state); S.geo = Boolean(on); return R(true, { hours: on ? SMS.geoHours : 0.1 }); }
export function setUseCases(state, { otp, alerts }) { const S = smsSlice(state); if (otp != null) S.useOtp = Boolean(otp); if (alerts != null) S.useAlerts = Boolean(alerts); return R(true, { hours: 0.25 }); }
export const perSegmentUsd = (S) => { const p = SMS_PROVIDERS[S.provider]; return p ? round2((p.perSeg + p.carrier) * 10000) / 10000 : 0; };

/** Daily SMS: registration decisions, sends (or blocks), costs, pumping fraud. Returns { lossShare } of today's signups. */
export function smsDay(state) {
  const S = smsSlice(state);
  if (!S.provider) return { lossShare: 0 };
  const t = today(state);
  const st = ensureStripe(state);
  const p = SMS_PROVIDERS[S.provider];
  const mk = (id, payload) => logMistake(state, { functionId: 'transactional_email', app: 'transactional', id, ...payload });
  // 1. registration outcome
  if (S.reg.status === 'pending' && t >= S.reg.readyDay) {
    const missing = Object.values(S.reg.items).filter((x) => !x).length;
    const rejectP = 0.05 + 0.3 * missing; // [design] missing opt-in / privacy / samples is the usual rejection reason
    if (h01(`smsdec|${state.seed}|${S.reg.submittedDay}|${S.reg.attempts}`) < rejectP) {
      S.reg.status = 'rejected';
      notify(state, `${p.label}: your ${S.numberType === 'tollfree' ? 'toll-free verification' : '10DLC campaign'} was rejected (opt-in, privacy policy or sample messages incomplete). Fix and resubmit; it takes another wait.`, { type: 'bad', app: 'transactional' });
      mk('sms_registration_rejected', { label: 'SMS registration rejected for missing details', cost: { hours: SMS.regHours, usd: S.numberType === 'tollfree' ? 0 : SMS.vettingFee, days: SMS.regDays[0] }, delayed: true, detail: `Missing: ${Object.entries(S.reg.items).filter(([, v]) => !v).map(([k]) => SMS_ITEMS[k].toLowerCase()).join('; ') || 'nothing obvious (carrier vetting is strict)'}. Stellar operators submit the opt-in flow, privacy link and branded STOP/HELP samples the first time.`, key: `smsrej:${S.reg.attempts}` });
    } else {
      S.reg.status = 'approved';
      const r = state.recurring?.find((x) => x.id === S.billId); if (r && S.numberType === '10dlc') r.amount = round2(p.number + SMS.campaignMonthly);
      notify(state, `${p.label}: SMS registration approved. Carriers now deliver your login codes and alerts.`, { type: 'good', app: 'transactional' });
    }
  }
  // 2. volume and segments
  const newSubs = st.subscriptions.filter((s) => s.startDay === t).length;
  const accounts = activeSubs(state).length;
  const msgs = (S.useOtp ? newSubs * SMS.otpPerSignup + accounts * SMS.loginsPerAcctMonth / 30 : 0) + (S.useAlerts ? accounts * SMS.alertsPerAcctMonth / 30 : 0);
  const seg = segmentsOf(renderSms(state, S.template));
  const ok = registered(S);
  const unit = p.perSeg + p.carrier;
  const cost = ok ? msgs * seg.segments * unit : msgs * SMS.failedFee;
  S.accrued = round2(S.accrued + cost);
  S.stats.sent += ok ? msgs : 0; S.stats.blocked += ok ? 0 : msgs; S.stats.segments += ok ? msgs * seg.segments : 0; S.stats.cost = round2(S.stats.cost + cost);
  if (ok && seg.segments > 1) S.stats.extraSegCost = round2(S.stats.extraSegCost + msgs * (seg.segments - 1) * unit);
  if (ok && seg.segments > 1 && S.stats.extraSegCost >= 5) mk('sms_multi_segment', { label: seg.gsm ? 'SMS template longer than one segment' : 'Unicode in the SMS template (70-character segments)', cost: { usd: round2(S.stats.extraSegCost) }, delayed: true, detail: `"${renderSms(state, S.template).slice(0, 80)}" is ${seg.len} characters${seg.gsm ? '' : ' with a non-GSM character (emoji or curly quote), so each segment holds 70, not 160'}: ${seg.segments} segments per message. Every login code costs ${seg.segments}x.`, key: 'sms_seg' });
  // 3. blocked traffic: the code never arrives
  let lossShare = 0;
  if (!ok && msgs > 0 && S.useOtp) {
    lossShare = S.emailFallback ? SMS.lostWithEmailFallback : SMS.lostIfNoCode;
    const lost = newSubs * lossShare;
    S.stats.lostSignups = round2(S.stats.lostSignups + lost);
    const sup = state.apps?.support; if (sup?.active && Array.isArray(sup.queue) && newSubs > 0) sup.queue.push({ day: t, n: Math.max(1, Math.round(newSubs * 0.3)), source: 'sms_code_missing' });
    if (newSubs > 0) mk('sms_unregistered_blocked', { label: 'Sent SMS login codes before carrier registration', cost: { customers: Math.max(1, Math.round(lost)), hours: 1 }, charge: true, delayed: true, detail: `Unregistered ${S.numberType === 'tollfree' ? 'toll-free' : '10DLC'} traffic is blocked by US carriers: ${Math.round(msgs)} codes today never arrived${S.emailFallback ? ' (the email fallback saved most signups)' : ' and there was no email fallback'}. Register the brand and campaign (days to weeks) before launch and keep email as a fallback.`, key: `smsblock:${Math.floor(t / 30)}` });
  }
  // 4. SMS pumping on an OTP endpoint with no geo permissions or rate limits
  if (S.useOtp && t % 30 === 17) {
    const pr = S.geo ? SMS.pumpingPerMonth * 0.1 : SMS.pumpingPerMonth * (accounts > 50 ? 2 : 1);
    if (h01(`pump|${state.seed}|${t}`) < pr) {
      const [a, b] = SMS.pumpingUsd;
      const usd = Math.round(a * (b / a) ** h01(`pumpusd|${state.seed}|${t}`) * (S.geo ? 0.1 : 1));
      S.stats.pumping++;
      post(state, { amount: -usd, counterparty: p.label, description: 'SMS pumping: bots requested login codes to premium international numbers', category: 'software', method: 'card' });
      notify(state, `SMS pumping attack: bots triggered login codes to premium-rate numbers abroad, ${usd} USD. ${S.geo ? 'Geo permissions limited it.' : 'Restrict destination countries and rate-limit the code endpoint.'}`, { type: 'bad', app: 'transactional' });
      if (!S.geo) mk('sms_pumping', { label: 'OTP endpoint open to SMS pumping', cost: { usd, hours: 2 }, charge: true, detail: 'No geo permissions, per-number rate limits or CAPTCHA on the "send code" endpoint. Bots requested codes to premium numbers they share revenue on.', key: `pump:${Math.floor(t / 30)}` });
    }
  }
  // 5. month end: usage bill
  if (t % 30 === 0 && S.accrued >= 0.01) {
    post(state, { amount: -S.accrued, counterparty: p.label, description: `SMS usage: ${ok ? `${seg.segments} segment(s)/message at ~$${round2(unit * 1000) / 1000}` : 'failed-message fees (blocked, unregistered)'}`, category: 'software', method: 'card' });
    S.accrued = 0;
  }
  return { lossShare: clamp(lossShare, 0, 0.6) };
}

/** 0-1 SMS hygiene for the infra/comms operator read; null when SMS is not used. */
export function smsHygiene(state) {
  const S = state.apps?.transactional?.sms;
  if (!S?.provider) return null;
  const seg = segmentsOf(renderSms(state, S.template));
  return clamp((registered(S) ? 0.5 : S.reg.status === 'pending' ? 0.25 : 0) + (S.emailFallback ? 0.2 : 0) + (S.geo ? 0.2 : 0) + (seg.segments === 1 ? 0.1 : 0), 0, 1);
}

/** smsDay plus its effect on signups: a login code that never arrives loses the signup (Lifecycle reads L.txn.loss). */
export function smsTick(state) {
  const r = smsDay(state);
  const L = ensureLifecycle(state);
  const prev = L.txn?.smsLoss ?? 0;
  if (!r.lossShare && !prev) return r;
  if (!r.lossShare && L.txn?.bySms) { L.txn = null; return r; } // registered now: back to the email-only path
  const base = L.txn ? clamp((L.txn.loss ?? 0) - prev, 0, 0.6) : transactionalLoss(state, L);
  const add = round2(r.lossShare * (1 - base));
  L.txn = { gain: 0, external: false, separate: false, delivery: 0.88, bySms: !L.txn || L.txn.bySms === true, ...(L.txn ?? {}), loss: clamp(base + add, 0, 0.6), smsLoss: add };
  return r;
}
