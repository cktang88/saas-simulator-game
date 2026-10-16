// Every app (tool) in the simulator. Order = sidebar order. Each module's default export follows the
// contract in docs/ARCHITECTURE.md: { id, title, icon, group, models?, badge?, render, onDay?, onMonthEnd?, jobs? }.

import home from './home.js';
import mail from './mail.js';
import calendar from './calendar.js';
import messages from './messages.js';
import you from './you.js';
import outcomes from './outcomes.js';
import bank from './bank.js';
import stripe from './stripe.js';
import books from './books.js';
import analytics from './analytics.js';
import crm from './crm.js';
import outreach from './outreach.js';
import calls from './calls.js';
import success from './success.js';
import ads from './ads.js';
import organic from './organic.js';
import consumer from './consumer.js';
import searchtools from './searchtools.js';
import transactional from './transactional.js';
import audience from './audience.js';
import plg from './plg.js';
import lifecycle from './lifecycle.js';
import market from './market.js';
import channels from './channels.js';
import segment from './segment.js';
import pricing from './pricing.js';
import website from './website.js';
import product from './product.js';
import customers from './customers.js';
import research from './research.js';
import mvp from './mvp.js';
import helpdesk from './helpdesk.js';
import insights from './insights.js';
import fundraising from './fundraising.js';
import financing from './financing.js';
import services from './services.js';
import people from './people.js';
import legal from './legal.js';
import cofounder from './cofounder.js';
import settings from './settings.js';
import assistant from './assistant.js';
import automations from './automations.js';
import todos from './todos.js';
import help from './help.js';
import { registerApps } from '../core/unlocks.js';

// The clock runs onDay/onMonthEnd in this order too. Analytics goes last: its month-end hook records how many MRR events
// existed at the end of the tick (MRR movements reconcile against the end-of-day snapshot), so every other app's
// same-day changes (Success seat expansions, Pricing month-end changes...) must already have happened.
export const APPS = [home, todos, mail, messages, calendar, assistant, you, outcomes, bank, stripe, books, crm, outreach, calls, success, ads, organic, consumer, searchtools, transactional, lifecycle, audience, plg, channels, segment, pricing, market, website, product, customers, research, mvp, helpdesk, insights, fundraising, financing, services, people, cofounder, legal, automations, settings, help, analytics];

// Progressive disclosure (core/unlocks.js) needs app titles, groups and models without importing the apps.
registerApps(APPS);
