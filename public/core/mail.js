// Founder inbox. Prospects, investors, customers, candidates and vendors all talk to you here.

import { uid } from './util.js';

export const ensureMail = (state) => (state.mail ??= { threads: [] });

// kind: 'prospect' | 'investor' | 'customer' | 'candidate' | 'vendor' | 'system'
export function newThread(state, { subject, with: who, kind = 'system', app = null, refId = null }) {
  const t = { id: uid('th'), subject, with: who, kind, app, refId, messages: [], unread: false, lastDay: state.day, archived: false };
  ensureMail(state).threads.unshift(t);
  return t;
}

export function findThread(state, refId) {
  return ensureMail(state).threads.find((t) => t.refId === refId);
}

// from: 'me' | 'them'
export function addMessage(state, threadId, { from, body, subject = null, meta = {} }) {
  const t = ensureMail(state).threads.find((x) => x.id === threadId);
  if (!t) return null;
  const m = { id: uid('msg'), from, day: state.day, body, subject: subject ?? t.subject, meta };
  t.messages.push(m);
  t.lastDay = state.day;
  if (from === 'them') t.unread = true;
  // most recent first
  const box = ensureMail(state).threads;
  box.splice(box.indexOf(t), 1);
  box.unshift(t);
  return m;
}

export const unreadCount = (state) => ensureMail(state).threads.filter((t) => t.unread && !t.archived).length;
