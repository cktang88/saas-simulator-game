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

export const APPS = [home, mail, messages, calendar, assistant, you, outcomes, bank, stripe, books, analytics, crm, outreach, calls, success, ads, organic, consumer, searchtools, transactional, lifecycle, audience, plg, channels, pricing, market, website, product, customers, research, mvp, helpdesk, insights, fundraising, financing, services, people, cofounder, legal, automations, settings];
