// Launch playbook: a mobile consumer-app path (stack, build, App Review, in-app purchase economics), composable acquisition
// channels (Meta app campaigns, creator marketplace, clipping, ASO, founder content) and one paywall funnel they all share.
// Engine modules live in apps/consumer/*; research in docs/research/consumer-apps/. Dedicated seeded stream (state.apps.consumer.rs),
// so the main rng sequence is unchanged until the player starts a store app.

import { render } from './consumer/ui.js';
import { storeDay, storeMonthEnd } from './consumer/store.js';
import { monetDay, monetMonthEnd } from './consumer/monetize.js';
import { creatorsDay, creatorsMonthEnd } from './consumer/creators.js';
import { clippingDay } from './consumer/clipping.js';
import { paidDay } from './consumer/paid.js';
import './consumer/funnel.js'; // registers the acquire() gate
import './consumer/readers.js'; // registers the consumer_app_growth operator reader

export { consumerEvents, CONSUMER_TRIGGERS } from './consumer/events.js';

export default {
  id: 'launch',
  title: 'Launch playbook',
  icon: '🚀',
  group: 'Growth',
  models: ['b2c'],
  badge: (state) => {
    const C = state.apps.consumer;
    return C?.app?.pending ? 1 : null;
  },
  render(root, ctx) { render(root, ctx); },
  onDay(state) {
    if (!state.apps.consumer) return; // nothing happens until the player opens the playbook or starts an app
    storeDay(state);
    monetDay(state);
    creatorsDay(state);
    clippingDay(state);
    paidDay(state);
  },
  onMonthEnd(state) {
    if (!state.apps.consumer) return;
    storeMonthEnd(state);
    creatorsMonthEnd(state);
    monetMonthEnd(state);
  },
};
