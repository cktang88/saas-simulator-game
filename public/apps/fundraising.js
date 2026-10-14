// Fundraising: founder profile & data room, AI investor panel (research rubric), investor CRM with live pitch
// meetings, rounds & instruments (post-money SAFE, priced rounds, accelerators, RBF, grants), a Carta-style
// cap table and an exit marketplace. Pure logic lives in ./fundraising/*.js (tested in test/fundraising.test.js).
// Research: docs/research/fundraising.md, docs/research/angels-and-landscape-2026.md.

import { html, mount } from '../core/ui.js';
import { money } from '../core/util.js';
import { ensureFr, fundraisingDay, jobs, meetingById } from './fundraising/sim.js';
import { archetypesReady } from './fundraising/investors.js';
import { renderProfile, wireProfile } from './fundraising/view-profile.js';
import { renderEval, wireEval } from './fundraising/view-eval.js';
import { renderCrm, wireCrm, renderMeeting, wireMeeting } from './fundraising/view-crm.js';
import { renderRounds, wireRounds } from './fundraising/view-rounds.js';
import { renderCap, wireCap } from './fundraising/view-cap.js';
import { renderExit, wireExit } from './fundraising/view-exit.js';
import { renderIr, wireIr } from './fundraising/view-ir.js';
import { renderRoom, wireRoom } from './fundraising/view-room.js';
import './fundraising/operator.js'; // registers the fundraising and investor_relations operator readers

const TABS = [
  ['profile', 'Profile & data room'],
  ['eval', 'Investor panel'],
  ['crm', 'Investors'],
  ['room', 'Deck links & data room'],
  ['rounds', 'Rounds & instruments'],
  ['ir', 'Investor relations'],
  ['cap', 'Cap table'],
  ['exit', 'Exit'],
];

let rerenderOnArchetypes = null;
archetypesReady.then(() => rerenderOnArchetypes?.());

export default {
  id: 'fundraising',
  title: 'Fundraising',
  icon: '💰',
  group: 'Capital',
  badge: (state) => {
    const fr = state.apps.fundraising;
    if (!fr) return 0;
    return (fr.investors ?? []).filter((i) => i.status === 'term_sheet').length + (fr.meetings ?? []).filter((m) => m.status === 'scheduled' && m.day === state.day).length + (fr.exit?.offers?.length ?? 0);
  },
  render(root, ctx) {
    rerenderOnArchetypes = () => ctx.render();
    const s = ctx.state;
    const fr = ensureFr(s);
    const [tabRaw, sub] = ctx.params.split(':');
    const mtg = tabRaw.startsWith('mtg_') ? meetingById(fr, tabRaw) : null;
    const tab = mtg ? 'crm' : tabRaw.startsWith('board_') ? 'ir' : TABS.some(([k]) => k === tabRaw) ? tabRaw : fr.evaluations.length ? 'crm' : 'profile';
    const indie = s.company.path === 'indie';
    const body = mtg ? renderMeeting(ctx, mtg)
      : tab === 'profile' ? renderProfile(ctx)
        : tab === 'eval' ? renderEval(ctx)
          : tab === 'crm' ? renderCrm(ctx, sub)
            : tab === 'rounds' ? renderRounds(ctx)
              : tab === 'ir' ? renderIr(ctx)
              : tab === 'room' ? renderRoom(ctx)
              : tab === 'cap' ? renderCap(ctx)
                : renderExit(ctx);
    mount(root, html`
      <div class="app-head"><div><h1>Fundraising</h1>
        <p>${indie ? 'Indie path: you don\'t have to raise. Use this for non-dilutive money (RBF, grants), a small seed-strap round if it truly helps, your cap table, or selling the business.' : 'Your real LinkedIn, bio and deck plus your real metrics decide what you can raise. Most investors pass; run a tight, time-boxed process.'}</p></div>
        ${fr.raise ? html`<div class="app-actions"><span class="badge accent">Raising ${money(fr.raise.raised ?? 0)} / ${money(fr.raise.target)}</span></div>` : ''}
      </div>
      <div class="tabs">${TABS.map(([k, l]) => html`<a href="#/fundraising/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${body}`);
    if (mtg) return wireMeeting(root, ctx, mtg.id);
    if (tab === 'profile') wireProfile(root, ctx);
    else if (tab === 'eval') wireEval(root, ctx);
    else if (tab === 'crm') wireCrm(root, ctx, sub);
    else if (tab === 'rounds') wireRounds(root, ctx);
    else if (tab === 'ir') wireIr(root, ctx);
    else if (tab === 'room') wireRoom(root, ctx);
    else if (tab === 'cap') wireCap(root, ctx);
    else wireExit(root, ctx);
  },
  onDay(state) {
    fundraisingDay(state);
  },
  jobs,
};
