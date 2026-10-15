// Async job queue for work that needs an LLM (prospect replies, investor judgments, customer panels).
// The daily simulation is synchronous; it enqueues jobs into state.jobs and the runner processes them
// in the background, applying results through handlers that apps register by type.

import { uid } from './util.js';

const handlers = {};

export function registerJob(type, handler) {
  handlers[type] = handler;
}

// notBefore: the game day from which the job may run (e.g. a person's reply that takes a day or two).
export function enqueue(state, type, payload, { label = type, notBefore = null } = {}) {
  const job = { id: uid('job'), type, payload, label, status: 'pending', createdDay: state.day, attempts: 0, ...(notBefore > state.day ? { notBefore } : {}) };
  state.jobs.push(job);
  return job;
}

const ready = (state, j) => j.status === 'pending' && !(j.notBefore > state.day);
export const pendingCount = (state) => state.jobs.filter((j) => ready(state, j) || j.status === 'running').length;
// A reply job still waiting for its day, if any (for "awaiting reply" hints).
export const scheduledFor = (state, pred) => state.jobs.find((j) => j.status === 'pending' && j.notBefore > state.day && pred(j));

let running = false;

// Process pending jobs. ctx = { state, save, render }. Safe to call often.
export async function runJobs(ctx) {
  if (running) return;
  running = true;
  try {
    for (const j of ctx.state.jobs) if (j.status === 'running') j.status = 'pending'; // interrupted by reload
    while (true) {
      const batch = ctx.state.jobs.filter((j) => ready(ctx.state, j)).slice(0, 3);
      if (!batch.length) break;
      await Promise.all(batch.map(async (job) => {
        const h = handlers[job.type];
        if (!h) { job.status = 'failed'; job.error = `No handler for ${job.type}`; return; }
        job.status = 'running';
        job.attempts++;
        try {
          await h(ctx, job.payload, job);
          job.status = 'done';
        } catch (e) {
          console.error(`[jobs] ${job.type} failed`, e);
          job.status = job.attempts < 2 ? 'pending' : 'failed';
          job.error = e.message;
        }
      }));
      ctx.state.jobs = ctx.state.jobs.filter((j) => j.status !== 'done');
      ctx.save?.();
      ctx.render?.();
    }
  } finally {
    running = false;
  }
}

// Synchronous drain for tests (handlers may still be async; awaited one by one).
export async function drainJobs(ctx) {
  running = false;
  await runJobs(ctx);
}

export const hasJob = (type) => Boolean(handlers[type]);
