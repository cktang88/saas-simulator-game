// Settings: AI judges (OpenRouter key and models), company & founder profile, save export/import.

import { html, mount, on, formData, toast, download, readFile, modal } from '../core/ui.js';
import { MODELS, PATHS } from '../core/state.js';
import { classifyChange, registerChange, snapshotOf, PIVOT_TYPES, pivotTypeIds } from '../core/pivots.js';
import { judgeKey } from '../core/truth.js';
import { hasJob } from '../core/jobs.js';
import { setIdCounter, getIdCounter } from '../core/util.js';
import { listFiles, putFile } from '../core/store.js';
import { learningMode, setLearningMode } from '../core/advice.js';
import { bindKeyField, connectionField, bindConnectionField, connectionPatch, CONNECTION_INFO } from '../core/keyui.js';

export default {
  id: 'settings',
  title: 'Settings',
  icon: '⚙️',
  group: 'Company',
  render(root, ctx) {
    const s = ctx.state;
    const llm = ctx.llm.getSettings();
    mount(root, html`
      <div class="app-head"><div><h1>Settings</h1><p>Your company profile drives the judges: customers, prospects and investors (LLM-played with a key, offline heuristics without) read your one-liner and ICP. Be specific.</p></div></div>
      <div class="grid-2">
        <section class="panel">
          <h2>AI connection</h2>
          <p class="muted small">Customers, prospects, candidates and investors are played by LLMs through OpenRouter, with Exa web search for market research. Every live connection gets the same models, search and judges; they differ only in who pays and where requests go.</p>
          ${connStatus(ctx.llm.getConnectionInfo())}
          <form id="llmForm">
            ${connectionField({ settings: llm, current: ctx.llm.getConnectionInfo().connection })}
            <label>Chat models (one per line; replies and single judgments use the first, panel judgments ask each one) <textarea name="models" rows="3">${llm.models.join('\n')}</textarea></label>
            <label>Decision model (typed choices, yes/no and rubric scores with probabilities) <input name="decisionModel" value="${llm.decisionModel}" /></label>
            <div class="inline"><button class="primary">Save</button><button type="button" id="testLlm">Test connection</button></div>
          </form>
          <p class="small muted">Spend so far: $${s.llmUsage.usd.toFixed(3)} over ${s.llmUsage.calls - s.llmUsage.mockCalls} live calls; ${s.llmUsage.mockCalls} answered by the offline heuristic${s.llmUsage.failedCalls ? html`, <span class="neg">${s.llmUsage.failedCalls} of them live calls that failed and fell back</span>` : ''}.${ctx.llmHealth?.lastError ? html` <span class="neg">Last error: ${ctx.llmHealth.lastError}</span>` : ''}</p>
        </section>
        <section class="panel">
          <h2>Company</h2>
          <form id="coForm">
            <label>Name <input name="name" value="${s.company.name}" /></label>
            <label>One-liner (what, for whom) <input name="oneLiner" value="${s.company.oneLiner}" maxlength="160" /></label>
            <label>Ideal customer profile <textarea name="icp" placeholder="Who exactly buys? Role, company size/type or consumer segment, the painful moment, what they use today, budget.">${s.company.icp}</textarea></label>
            <p class="small">Domain: ${s.company.domain ? html`<b>${s.company.domain}</b>` : html`<span class="warn">none yet</span>`} · <a href="#/website">${s.company.domain ? 'Manage' : 'Pick and register one'} in Website →</a></p>
            <p class="small muted">Model: ${MODELS[s.company.model].label} · Path: ${PATHS[s.company.path].label}</p>
            <button class="primary">Save company</button>
          </form>
        </section>
        <section class="panel">
          <h2>Founder</h2>
          <form id="fdForm">
            <div class="grid-2">
              <label>Hours per week <input type="number" name="hoursPerWeek" min="10" max="90" value="${s.founder.hoursPerWeek}" /></label>
              <label>Monthly salary / owner draw ($) <input type="number" name="salary" min="0" step="250" value="${s.founder.salary}" /></label>
              <label>Close friends & family <input type="number" name="friends" min="0" value="${s.founder.network.friends}" /></label>
              <label>LinkedIn connections <input type="number" name="linkedin" min="0" value="${s.founder.network.linkedin}" /></label>
              <label>X / Bluesky followers <input type="number" name="x" min="0" value="${s.founder.network.x}" /></label>
              <label>Email list <input type="number" name="newsletter" min="0" value="${s.founder.network.newsletter}" /></label>
            </div>
            <p class="small muted">Upload your LinkedIn profile and bio in Fundraising → Founder profile.</p>
            <button class="primary">Save founder</button>
          </form>
        </section>
        <section class="panel">
          <h2>Built-in coaching (learning mode)</h2>
          <p class="muted small">Off by default: advice comes from people you recruit in Advisors (advisors, consultants, mentors, your board, peers), who see only what you share and are not all equally good. Turn this on for training wheels: tiers, coaching, lessons from mistakes and habit explanations appear everywhere, tagged "Coach (learning mode)".</p>
          <label><input type="checkbox" id="learningMode" ${learningMode(s) ? 'checked' : ''} /> Show built-in coaching</label>
        </section>
        <section class="panel">
          <h2>Save file</h2>
          <div class="inline"><button id="export">Export save (.json)</button><label class="btn">Import save<input type="file" id="import" accept=".json" hidden /></label></div>
          <h3>Danger zone</h3>
          <button class="danger" id="reset">Abandon this company and start over</button>
          <p class="small muted">The classic, simpler version of the game is still at <a href="classic/">classic/</a>.</p>
        </section>
      </div>`);

    on(root, 'change', '#learningMode', (e) => ctx.act((st) => { setLearningMode(st, e.target.checked); toast(e.target.checked ? 'Built-in coaching on.' : 'Built-in coaching off: advice now comes from your advisors.', 'info'); }));
    bindKeyField(root, { onForget: () => { toast('OpenRouter key removed from this browser.', 'info'); ctx.render(); } });
    bindConnectionField(root.querySelector('#llmForm'));
    on(root, 'submit', '#llmForm', async (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const saved = ctx.llm.setSettings({ ...connectionPatch(f), models: String(f.models ?? '').split('\n').map((m) => m.trim()).filter(Boolean), decisionModel: String(f.decisionModel ?? '').trim() });
      const info = await ctx.llm.applyConnection();
      const warn = connectionWarnings(f, saved);
      const msg = info.connection === 'offline' ? 'Offline: heuristic judges only.' : info.reachable === false ? `Saved, but ${info.error}. Calls fall back offline until it answers.` : `Connected: ${CONNECTION_INFO[info.connection].label}.`;
      toast([msg, ...warn].join(' '), (info.reachable === false && info.connection !== 'offline') || warn.length ? 'warn' : 'good', 9000);
      ctx.render();
    });
    on(root, 'click', '#testLlm', async (e) => {
      e.target.disabled = true;
      const res = await ctx.llm.panel({
        task: 'connection_test',
        prompt: 'Reply with JSON {"ok": true, "who": "<your model name>"}.',
        schema: { type: 'object', additionalProperties: false, required: ['ok', 'who'], properties: { ok: { type: 'boolean' }, who: { type: 'string' } } },
        maxTokens: 50,
        fallback: () => ({ ok: false, who: 'offline' }),
      });
      e.target.disabled = false;
      modal({ title: 'Connection test', body: html`<ul class="list">${res.map((r) => html`<li><b>${r.model}</b>: ${r.mock ? html`<span class="neg">offline${r.error ? ` (${r.error})` : ''}</span>` : html`<span class="pos">OK, answered as ${r.data.who}</span>`}</li>`)}</ul>` });
    });
    on(root, 'submit', '#coForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const prev = snapshotOf(s.company);
      const next = { ...prev, oneLiner: f.oneLiner.trim(), icp: f.icp.trim() };
      const ideaChanged = next.oneLiner !== s.company.oneLiner || next.icp !== s.company.icp;
      const apply = (type) => {
        let entry = null;
        ctx.act((st) => {
          // The domain is bought in Website -> Domain (apps/website/domain.js), which records the public registration.
          Object.assign(st.company, { name: f.name.trim() || st.company.name, oneLiner: next.oneLiner, icp: next.icp });
          // One detector (core/pivots.js) records the pivot, charges the hours and re-draws what the type says.
          entry = registerChange(st, prev, next, { type });
          if (ideaChanged && st.company.oneLiner && hasJob('world:competitors')) ctx.enqueue('world:competitors', { reason: 'idea_changed' }, { label: 'Researching competitors' });
          // Feature judgments made for another ICP or idea are stale: ask the market again.
          if (ideaChanged && hasJob('product:value')) for (const ft of st.apps.product?.features ?? []) if (ft.status === 'shipped' && !ft.system && ft.valueKey !== judgeKey(st)) ctx.enqueue('product:value', { featureId: ft.id }, { label: 'Market reacts to a new feature' });
        });
        toast(entry ? `${PIVOT_TYPES[entry.type].label} recorded (${entry.hours} founder hours). Kept: ${entry.kept.slice(0, 2).join(', ').toLowerCase()}.` : ideaChanged ? 'Saved. Researching competitors for your idea…' : 'Saved.', 'good');
      };
      const cls = ideaChanged ? classifyChange(s, prev, next) : { type: null };
      if (!cls.type) return apply(null);
      // "What kind of change is this?" You choose; the type decides what is kept, what is lost and what it costs.
      modal({
        title: 'What kind of change is this?',
        body: html`<p class="small muted">${cls.why} Pick the closest description. Re-wording the same idea is not a pivot.</p>
          <div class="list">${pivotTypeIds.map((id) => html`<label class="row"><input type="radio" name="pivotType" value="${id}" ${id === cls.type ? 'checked' : ''} />
            <span><b>${PIVOT_TYPES[id].label}</b> <span class="small muted">(about ${PIVOT_TYPES[id].hours} founder hours)</span><br /><span class="small">${PIVOT_TYPES[id].summary}</span><br />
            <span class="small pos">Kept: ${PIVOT_TYPES[id].keeps.join('; ')}.</span><br /><span class="small neg">Lost: ${PIVOT_TYPES[id].loses.join('; ')}.</span></span></label>`)}
            <label class="row"><input type="radio" name="pivotType" value="none" /><span><b>Just re-wording</b> <span class="small muted">(no pivot, nothing lost)</span></span></label></div>`,
        actions: [{ label: 'Cancel' }, { label: 'Confirm change', primary: true, onClick: (d) => { apply(d.querySelector('input[name=pivotType]:checked')?.value ?? cls.type); } }],
      });
    });
    on(root, 'submit', '#fdForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => {
        // An emptied number field comes back as null: keep the old value rather than writing null into the sim.
        const num = (v, old) => (Number.isFinite(v) ? v : old);
        st.founder.hoursPerWeek = Math.min(90, Math.max(10, num(f.hoursPerWeek, st.founder.hoursPerWeek)));
        st.founder.salary = Math.max(0, num(f.salary, st.founder.salary));
        const nw = st.founder.network;
        Object.assign(nw, { friends: num(f.friends, nw.friends), linkedin: num(f.linkedin, nw.linkedin), x: num(f.x, nw.x), newsletter: num(f.newsletter, nw.newsletter) });
      });
      toast('Saved.', 'good');
    });
    // The export is a full backup: game state plus uploaded files (deck, LinkedIn PDF) under `files`.
    on(root, 'click', '#export', async () => {
      let files = [];
      try { files = await listFiles(); } catch (err) { console.error(err); }
      // Stamp the live id counter: state.idCounter is only refreshed on save, and an import restores ids from it.
      s.idCounter = getIdCounter();
      download(`${s.company.name.replace(/\W+/g, '-')}-day${s.day}.json`, JSON.stringify({ ...s, files }), 'application/json');
    });
    on(root, 'change', '#import', async (e) => {
      const f = await readFile(e.target.files[0]);
      try {
        const data = JSON.parse(f.text);
        if (data.v !== 3) throw new Error('Not a v3 save file');
        const files = Array.isArray(data.files) ? data.files : [];
        delete data.files;
        for (const file of files) if (file?.id) await putFile(file);
        Object.keys(s).forEach((k) => delete s[k]);
        Object.assign(s, data);
        setIdCounter(data.idCounter);
        ctx.save();
        ctx.render();
        ctx.runJobs?.(); // the imported save's pending LLM jobs run now, not at the next action
        toast('Save imported.', 'good');
      } catch (err) { toast(err.message, 'bad'); }
    });
    on(root, 'click', '#reset', () => modal({
      title: 'Start over?',
      body: html`<p>This deletes ${s.company.name} from this browser. Export a save first if you want to keep it.</p>`,
      actions: [{ label: 'Cancel' }, { label: 'Delete and start over', primary: true, onClick: () => ctx.newGame() }],
    }));
  },
};

/**
 * What the AI-connection form could not keep or cannot use, said at Save instead of discovered later: llm.js keeps the
 * decision model on a Jev model and drops Jev models from the chat list, and a "your own key" connection with no key
 * answers every call offline. f: the submitted form; saved: the settings as stored (setSettings' return).
 */
export function connectionWarnings(f, saved) {
  const out = [];
  if (f.connection === 'byok' && !String(f.apiKey ?? '').trim()) out.push('"Your own OpenRouter key" has no key yet: every call falls back to the offline heuristics until you add one.');
  const decision = String(f.decisionModel ?? '').trim();
  if (decision && decision !== saved.decisionModel) out.push(`The decision model must be a Jev model (typed choices with probabilities): "${decision}" was not kept; still using ${saved.decisionModel}.`);
  const dropped = String(f.models ?? '').split('\n').map((m) => m.trim()).filter((m) => m && !saved.models.includes(m));
  if (dropped.length) out.push(`Not used as chat models: ${dropped.join(', ')} (Jev models only answer typed questions).`);
  return out;
}

/** One line on what the current connection is doing (reachable, who pays, today's hosted allowance). */
function connStatus(c) {
  if (!c) return '';
  if (c.connection === 'offline') return html`<p class="callout warn small">Offline: no AI. Every judge is a deterministic heuristic.</p>`;
  if (c.reachable === false) return html`<p class="callout bad small">${CONNECTION_INFO[c.connection]?.label ?? c.connection}: ${c.error ?? 'not reachable'}. Live calls fall back offline until it answers.</p>`;
  if (c.connection === 'proxy' && c.limits) return html`<p class="callout small">Hosted AI: $${c.limits.ipSpentUsd.toFixed(2)} of your $${c.limits.ipDailyUsd.toFixed(2)} daily allowance used${c.limits.budgetLeft ? '' : html` · <span class="neg">today's shared budget is used up</span>`}. Your own key removes the limit.</p>`;
  return html`<p class="callout good small">Using ${CONNECTION_INFO[c.connection]?.label ?? c.connection}.</p>`;
}
