// Live UI smoke test against the already-running server (http://localhost:3000; this script starts no server).
// Run: node docs/review/llm-e2e/assistant-network-ui.mjs   (uses the globally installed Playwright)
// Creates a company, checks the top bar says "AI judges Live", then triggers three LLM actions through the UI:
// Settings → Test connection, Assistant chat, and Messages (network roster job). Fails on page errors.
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const root = execSync('npm root -g').toString().trim();
const { chromium } = (await import(`${root}/playwright/index.js`)).default;
const BASE = process.env.BASE ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// WORKTREE=1 serves this checkout's public/ files through Playwright routing (the API calls still go to the running
// server), so a fix can be checked live in the browser without starting another server.
if (process.env.WORKTREE) {
  const { readFileSync, existsSync } = await import('node:fs');
  const pub = join(HERE, '..', '..', '..', 'public');
  await page.route(/^http:\/\/localhost:3000\/(?!api\/).+\.(js|css)$/, (route) => {
    const f = join(pub, new URL(route.request().url()).pathname);
    if (!existsSync(f)) return route.continue();
    route.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
}
const errors = [], warns = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning' && /\[llm\]/.test(m.text())) warns.push(m.text()); });
const rows = [];
const check = (name, pass, note = '') => rows.push({ step: name, pass: pass ? 'PASS' : 'FAIL', note: String(note).slice(0, 160) });
const waitFor = async (fn, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await page.waitForTimeout(500); } return null; };

await page.goto(BASE);
await page.evaluate(async () => { localStorage.clear(); for (const db of (await indexedDB.databases?.()) ?? []) indexedDB.deleteDatabase(db.name); });
await page.goto(BASE);
await page.waitForSelector('#setupForm');
await page.fill('input[name=companyName]', 'Shelfbooks');
await page.fill('input[name=founderName]', 'Maya Chen');
await page.fill('input[name=oneLiner]', 'Automatic bookkeeping and sales-tax reconciliation for Shopify sellers');
await page.click('#setupForm button[type=submit]');
await page.waitForFunction(() => !document.body.classList.contains('setup-mode'), null, { timeout: 15000 });
for (let i = 0; i < 3; i++) { const b = page.getByRole('button', { name: /look around|close|got it/i }).first(); if (await b.count()) await b.click().catch(() => {}); }
const top = await waitFor(async () => { const t = await page.textContent('body'); return /AI judges\s*Live/.test(t) ? t : null; }, 10000);
check('top bar shows "AI judges Live"', !!top);

// 1. Settings → Test connection
await page.goto(`${BASE}/#/settings`);
await page.click('#testLlm');
const modal = await waitFor(async () => { const t = await page.locator('.modal').first().textContent().catch(() => ''); return /OK, answered|offline/.test(t ?? '') ? t : null; }, 30000);
check('Settings: connection test', /OK, answered/.test(modal ?? ''), modal);
await page.keyboard.press('Escape');
for (const b of await page.locator('.modal button').all()) await b.click().catch(() => {});

// 2. Assistant: pick a plan, ask a question
await page.goto(`${BASE}/#/assistant/plan`);
await page.locator('[data-plan]').first().click();
await page.waitForTimeout(500);
await page.goto(`${BASE}/#/assistant/chat`);
await page.fill('#chatQ', "What's our MRR and runway?");
await page.locator('#chatForm button').first().click();
const answer = await waitFor(async () => { const t = await page.locator('.app-body, #view').first().textContent(); return !/Thinking…/.test(t) && /could not|MRR|runway|access/i.test(t) ? t : null; }, 45000);
const offlineBadge = await page.locator('#view .badge', { hasText: 'offline' }).count();
check('Assistant chat answered live', !!answer && offlineBadge === 0, offlineBadge ? 'answer shows the "offline" badge (fell back)' : 'live answer rendered');

// 3. Messages: opening it builds the network roster with the LLM (job)
await page.goto(`${BASE}/#/messages/contacts`);
const roster = await waitFor(async () => { const t = await page.textContent('#view'); return /generating from your bio/.test(t) || !/ex colleague|former manager|classmate|acquaintance/.test(t) ? null : t; }, 90000);
check('Messages: network roster generated', !!roster, (roster ?? '').match(/Your network[\s\S]{0,160}/)?.[0]?.replace(/\s+/g, ' '));
await page.goto(`${BASE}/#/settings`);
const spend = (await page.textContent('#view')).match(/Spend so far:[^.]*\.\d+[^)]*\)/)?.[0];
check('Settings shows usage accounting', /over ([3-9]|\d\d+) live calls/.test(spend ?? ''), spend);
check('no page errors', errors.length === 0, errors.join(' | '));
check('no LLM fallbacks logged', warns.length === 0, warns.join(' | '));
mkdirSync(join(HERE, 'out'), { recursive: true });
await page.screenshot({ path: join(HERE, 'out', 'assistant-network-ui.png') });
writeFileSync(join(HERE, 'out', `assistant-network-ui${process.env.WORKTREE ? '-worktree' : ''}.json`), JSON.stringify({ rows, errors, warns }, null, 2));
console.table(rows);
await browser.close();
