// Events for the Automations app (separate "Launch playbook" block): app_review_result, clip_campaign_payout_due,
// creator_post_viral, view_fraud_detected, platform_policy_strike, paywall_test_result. Stable ids, read-only.

export const CONSUMER_TRIGGERS = ['app_review_result', 'clip_campaign_payout_due', 'creator_post_viral', 'view_fraud_detected', 'platform_policy_strike', 'paywall_test_result'];

export function consumerEvents(state, since = state.day - 1) {
  const C = state.apps?.consumer;
  if (!C) return [];
  return C.events.filter((e) => e.day >= since).map((e) => ({ ...e }));
}
