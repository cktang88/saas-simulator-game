// Settings: AI judges (OpenRouter key and models), company & founder profile, save export/import.

import { html, mount, on, formData, toast, download, readFile, modal } from '../core/ui.js';
import { MODELS, PATHS } from '../core/state.js';
import { isPivot } from '../core/market.js';
import { hasJob } from '../core/jobs.js';
import { setIdCounter } from '../core/util.js';
import { listFiles, putFile } from '../core/store.js';

export default {
  id: 'settings',
  title: 'Settings',
  icon: '⚙️',
  group: 'Company',
  render(root, ctx) {
    const s = ctx.state;
    const llm = ctx.llm.getSettings();
    mount(root, html`
      <div class="app-head"><div><h1>Settings</h1><p>Your company profile drives every AI judge: customers, prospects and investors read your one-liner and ICP. Be specific.</p></div></div>
      <div class="grid-2">
        <section class="panel">
          <h2>AI judges (OpenRouter)</h2>
          <p class="muted small">Customers, prospects, candidates and investors are played by LLMs through OpenRouter. Without a key, deterministic offline heuristics stand in, so the game still works but judgments are cruder. Your key is stored only in this browser and sent only to your local server. You can also set OPENROUTER_API_KEY when starting the server.</p>
          <form id="llmForm">
            <label>OpenRouter API key <input name="apiKey" type="password" autocomplete="off" value="${llm.apiKey}" placeholder="sk-or-v1-…" /></label>
            <label>Panel models (one per line; every judgment is asked to each) <textarea name="models" rows="3">${llm.models.join('\n')}</textarea></label>
            <label><input type="checkbox" name="enabled" ${llm.enabled ? 'checked' : ''} /> Use live models when a key is available</label>
            <div class="inline"><button class="primary">Save</button><button type="button" id="testLlm">Test connection</button></div>
          </form>
          <p class="small muted">Spend so far: $${s.llmUsage.usd.toFixed(3)} over ${s.llmUsage.calls - s.llmUsage.mockCalls} live calls (${s.llmUsage.mockCalls} offline).</p>
        </section>
        <section class="panel">
          <h2>Company</h2>
          <form id="coForm">
            <label>Name <input name="name" value="${s.company.name}" /></label>
            <label>One-liner (what, for whom) <input name="oneLiner" value="${s.company.oneLiner}" maxlength="160" /></label>
            <label>Ideal customer profile <textarea name="icp" placeholder="Who exactly buys? Role, company size/type or consumer segment, the painful moment, what they use today, budget.">${s.company.icp}</textarea></label>
            <label>Sending domain <input name="domain" value="${s.company.domain}" placeholder="yourproduct.com" /></label>
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
          <h2>Save file</h2>
          <div class="inline"><button id="export">Export save (.json)</button><label class="btn">Import save<input type="file" id="import" accept=".json" hidden /></label></div>
          <h3>Danger zone</h3>
          <button class="danger" id="reset">Abandon this company and start over</button>
          <p class="small muted">The classic, simpler version of the game is still at <a href="/classic/">/classic/</a>.</p>
        </section>
      </div>`);

    on(root, 'submit', '#llmForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.llm.setSettings({ apiKey: f.apiKey.trim(), models: f.models.split('\n').map((m) => m.trim()).filter(Boolean), enabled: f.enabled });
      toast('AI judge settings saved.', 'good');
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
      const ideaChanged = f.oneLiner.trim() !== s.company.oneLiner || f.icp.trim() !== s.company.icp;
      const pivot = s.company.oneLiner && isPivot(s.company.oneLiner, f.oneLiner.trim());
      ctx.act((st) => {
        if (pivot) {
          // A real pivot: the market for the new idea is unknown again (hidden demand re-drawn) and the churn
          // category is re-inferred. Re-wording the same idea keeps both.
          st.company.pivots = (st.company.pivots ?? 0) + 1;
          st.company.b2cCategory = null;
          st.company.pivotLog = [...(st.company.pivotLog ?? []), { day: st.day, from: st.company.oneLiner, to: f.oneLiner.trim() }];
        }
        Object.assign(st.company, { name: f.name.trim() || st.company.name, oneLiner: f.oneLiner.trim(), icp: f.icp.trim(), domain: f.domain.trim().replace(/^https?:\/\//, '').replace(/\/.*/, '') });
        if (ideaChanged && st.company.oneLiner && hasJob('world:competitors')) ctx.enqueue('world:competitors', { reason: 'idea_changed' }, { label: 'Researching competitors' });
      });
      toast(pivot ? 'Pivot recorded: this is a new idea with a new, unknown market. Researching competitors…' : ideaChanged ? 'Saved. Researching competitors for your idea…' : 'Saved.', 'good');
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
