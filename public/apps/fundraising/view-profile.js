// Tab: Founder profile & data room (LinkedIn PDF/text, bio, links, pitch deck PDF/images/text).

import { html, on, readFile, toast } from '../../core/ui.js';
import { uid, words } from '../../core/util.js';
import { putFile, deleteFile } from '../../core/store.js';
import { ensureFr } from './sim.js';
import { drafts } from './drafts.js';

export const WARN_BYTES = 10 * 1024 * 1024; // models handle big PDFs poorly and slowly; LinkedIn PDFs are ~100KB
export const MAX_BYTES = 30 * 1024 * 1024;
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function renderProfile(ctx) {
  const s = ctx.state;
  const fr = ensureFr(s);
  const d = drafts.profile;
  const val = (k, fallback) => d[k] ?? fallback ?? '';
  const li = fr.linkedin;
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>Founder profile</h2>
        <p class="muted small">Investors at pre-seed weight founder-market fit (25%) and execution (20%) more than anything else. Use your real LinkedIn: on your profile click <b>More → Save to PDF</b>, then upload it here.</p>
        <label>LinkedIn profile PDF <input type="file" id="liFile" accept=".pdf,application/pdf,.txt" /></label>
        ${li ? html`<div class="card small">📄 ${li.name} · ${kb(li.size)} ${li.size > WARN_BYTES ? html`<span class="badge warn">large: models may truncate</span>` : ''} <button class="sm" data-act="rm-li">Remove</button></div>` : ''}
        <label>…or paste your LinkedIn profile text <textarea id="fr-li" data-draft="linkedinText" rows="6" placeholder="Headline, experience (roles, companies, years), education, projects…">${val('linkedinText', s.founder.linkedinText)}</textarea></label>
        <label>Short bio (what investors read first) <textarea id="fr-bio" data-draft="bio" rows="4" placeholder="Earned insight into the problem, what you've shipped, prior outcomes, why you.">${val('bio', s.founder.bio)}</textarea></label>
        <label>Links (GitHub, changelog, X, personal site, one per line) <textarea id="fr-links" data-draft="links" rows="3">${val('links', fr.links)}</textarea></label>
        <div class="inline"><button class="primary" data-act="save-profile">Save profile</button><span class="hint">Writing a tight bio takes real time (~15–40 min).</span></div>
      </section>
      <section class="panel">
        <h2>Pitch deck</h2>
        <p class="muted small">Upload the PDF you'd actually send (or slide images). 10–15 slides; investors spend ~3–4 minutes on a seed deck and only ~58% read to the end, so the first three slides decide it.</p>
        <label>Deck (PDF or slide images) <input type="file" id="deckFile" accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,.txt,.md" multiple /></label>
        ${fr.deck.files.length ? html`<ul class="list small">${fr.deck.files.map((f) => html`<li>📄 ${f.name} · ${kb(f.size)} ${f.size > WARN_BYTES ? html`<span class="badge warn">over 10 MB</span>` : ''} <button class="sm" data-rm-deck="${f.id}">Remove</button></li>`)}</ul>` : ''}
        <label>…or paste the deck text (slide by slide) <textarea id="fr-deck" data-draft="deckText" rows="12" placeholder="Slide 1: one-liner…&#10;Slide 2: problem…">${val('deckText', fr.deck.text)}</textarea></label>
        <div class="inline"><button class="primary" data-act="save-deck">Save deck text</button><span class="hint">${words(val('deckText', fr.deck.text))} words</span></div>
        <div class="callout small">Files are sent to the AI investor panel as documents (treated as untrusted data). Offline, only pasted text and file names are read by a crude keyword heuristic, so paste text too if you have no API key.</div>
      </section>
    </div>`;
}

async function storeUpload(file, purpose, state) {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is ${kb(file.size)}. Keep uploads under 30 MB (compress the PDF).`);
  if (file.size > WARN_BYTES) toast(`${file.name} is over 10 MB. That's slow and expensive for the models; consider compressing it.`, 'warn');
  const f = await readFile(file);
  const rec = { id: uid('file'), name: f.name, mime: f.mime, size: f.size, base64: f.base64, text: f.text, addedDay: state.day, purpose };
  await putFile(rec);
  return rec;
}

export function wireProfile(root, ctx) {
  on(root, 'input', '[data-draft]', (e, el) => { drafts.profile[el.dataset.draft] = el.value; });
  on(root, 'change', '#liFile', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await ctx.act(async (st) => {
      const rec = await storeUpload(file, 'linkedin', st);
      const fr = ensureFr(st);
      if (rec.text) { st.founder.linkedinText = rec.text.slice(0, 20000); drafts.profile.linkedinText = undefined; await deleteFile(rec.id); return; }
      if (fr.linkedin?.id) deleteFile(fr.linkedin.id).catch(() => {});
      fr.linkedin = { id: rec.id, name: rec.name, size: rec.size, mime: rec.mime };
      st.founder.linkedinFileId = rec.id;
      toast('LinkedIn PDF saved to your data room.', 'good');
    }, { hours: 0.1, label: 'Data room: LinkedIn' });
  });
  on(root, 'change', '#deckFile', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    await ctx.act(async (st) => {
      const fr = ensureFr(st);
      for (const file of files.slice(0, 20)) {
        const rec = await storeUpload(file, 'deck', st);
        if (rec.text) { fr.deck.text = rec.text.slice(0, 40000); drafts.profile.deckText = undefined; await deleteFile(rec.id); continue; }
        fr.deck.files.push({ id: rec.id, name: rec.name, size: rec.size, mime: rec.mime });
      }
    }, { hours: 0.1, label: 'Data room: deck' });
  });
  on(root, 'click', '[data-act=rm-li]', () => ctx.act((st) => {
    const fr = ensureFr(st);
    if (fr.linkedin) deleteFile(fr.linkedin.id).catch(() => {});
    fr.linkedin = null;
    st.founder.linkedinFileId = null;
  }));
  on(root, 'click', '[data-rm-deck]', (e, el) => ctx.act((st) => {
    const fr = ensureFr(st);
    deleteFile(el.dataset.rmDeck).catch(() => {});
    fr.deck.files = fr.deck.files.filter((f) => f.id !== el.dataset.rmDeck);
  }));
  on(root, 'click', '[data-act=save-profile]', () => {
    const d = drafts.profile;
    const s = ctx.state;
    const bio = d.bio ?? s.founder.bio;
    const changed = words(bio) - words(s.founder.bio);
    const hours = Math.min(0.75, 0.15 + Math.max(0, changed) / 300);
    ctx.act((st) => {
      if (d.linkedinText != null) st.founder.linkedinText = d.linkedinText.slice(0, 20000);
      if (d.bio != null) st.founder.bio = d.bio.slice(0, 5000);
      if (d.links != null) ensureFr(st).links = d.links.slice(0, 2000);
      drafts.profile = {};
      toast('Profile saved.', 'good');
    }, { hours, label: 'Founder bio & profile' });
  });
  on(root, 'click', '[data-act=save-deck]', () => {
    const d = drafts.profile;
    if (d.deckText == null) return;
    const hours = Math.min(1, 0.2 + Math.max(0, words(d.deckText) - words(ensureFr(ctx.state).deck.text)) / 250);
    ctx.act((st) => { ensureFr(st).deck.text = d.deckText.slice(0, 40000); drafts.profile.deckText = undefined; toast('Deck text saved.', 'good'); }, { hours, label: 'Pitch deck' });
  });
}
