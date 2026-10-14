// Every app (tool) in the simulator. Order = sidebar order. Each module's default export follows the
// contract in docs/ARCHITECTURE.md: { id, title, icon, group, models?, badge?, render, onDay?, onMonthEnd?, jobs? }.

import home from './home.js';
import mail from './mail.js';
import calendar from './calendar.js';
import bank from './bank.js';
import stripe from './stripe.js';
import books from './books.js';
import analytics from './analytics.js';
import crm from './crm.js';
import outreach from './outreach.js';
import calls from './calls.js';
import ads from './ads.js';
import organic from './organic.js';
import website from './website.js';
import product from './product.js';
import customers from './customers.js';
import research from './research.js';
import fundraising from './fundraising.js';
import financing from './financing.js';
import people from './people.js';
import legal from './legal.js';
import settings from './settings.js';

export const APPS = [home, mail, calendar, bank, stripe, books, analytics, crm, outreach, calls, ads, organic, website, product, customers, research, fundraising, financing, people, legal, settings];
