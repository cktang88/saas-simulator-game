// Negotiation adapters: import this once so every kind is registered with the engine and the daily hooks run.
import { registerDaily, negotiationDay } from '../../core/negotiation.js';
import { negotiatedDay } from './consequences.js';
import './enterprise.js';
import './vc.js';
import './mna.js';
import './others.js';
import './vendor.js';
import './hiring.js';

registerDaily(negotiatedDay);
export { negotiationDay };
export * from '../../core/negotiation.js';
export { startEnterpriseNegotiation, negotiationForDeal, canNegotiate } from './enterprise.js';
export { startVcNegotiation, negotiationForInvestor } from './vc.js';
export { startMnaNegotiation, negotiationForOffer } from './mna.js';
export { startVendorNegotiation, startHiringNegotiation, vendorSpec, hiringSpec, registerClose } from './others.js';
export { startRecurringNegotiation, negotiationForBill } from './vendor.js';
export { startHiringCandidateNegotiation, negotiationForCandidate } from './hiring.js';
