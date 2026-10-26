#!/usr/bin/env node
/**
 * Delete every Vercel deployment of this project that is OLDER than the one to keep.
 *
 *   VERCEL_TOKEN=… VERCEL_PROJECT_ID=… [VERCEL_TEAM_ID=…] KEEP_DEPLOYMENT=<url|dpl_id> \
 *     node scripts/cleanup-deployments.mjs [--dry-run]
 *   …or KEEP_SHA=<commit> to keep the production deployment built from that commit (waits up to
 *   WAIT_MINUTES, default 12, for it to become READY; aborts if it fails).
 *
 * Safety rails: it refuses to delete anything unless the deployment to keep is found
 * and READY, and it never touches deployments newer than it (e.g. a build in flight).
 * Project/team ids fall back to .vercel/project.json (created by `vercel link`).
 */
import { readFileSync } from 'node:fs';
import { findKeep, judge, selectOld } from './cleanup-lib.mjs';

const API = 'https://api.vercel.com';
const dry = process.argv.includes('--dry-run');
const token = process.env.VERCEL_TOKEN;
let projectId = process.env.VERCEL_PROJECT_ID;
let teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID;
const keepRaw = process.env.KEEP_DEPLOYMENT;

try {
  const linked = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
  projectId ||= linked.projectId;
  teamId ||= linked.orgId;
} catch {
  /* not linked locally */
}

const sha = process.env.KEEP_SHA;
const waitMs = Number(process.env.WAIT_MINUTES ?? (sha ? 12 : 0)) * 60000;

if (!token || !projectId || (!keepRaw && !sha)) {
  console.error('Need VERCEL_TOKEN, a project id (VERCEL_PROJECT_ID or .vercel/project.json) and KEEP_DEPLOYMENT or KEEP_SHA.');
  process.exit(1);
}

const q = (extra = {}) => new URLSearchParams({ ...(teamId && teamId.startsWith('team_') ? { teamId } : {}), ...extra }).toString();
const call = async (method, path, params) => {
  const res = await fetch(`${API}${path}?${q(params)}`, { method, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const listAll = async () => {
  const all = [];
  let until;
  do {
    const page = await call('GET', '/v6/deployments', { projectId, limit: '100', ...(until ? { until: String(until) } : {}) });
    all.push(...page.deployments);
    until = page.pagination?.next;
  } while (until);
  return all;
};

// With KEEP_SHA we are usually called right after a push, before Vercel has finished building: wait for it.
const started = Date.now();
let all;
let keep;
for (;;) {
  all = await listAll();
  keep = findKeep(all, { keep: keepRaw, sha });
  const verdict = judge(keep);
  if (verdict === 'go') break;
  if (verdict === 'abort') {
    console.error(`Deployment to keep ended as ${keep.state}; deleting nothing.`);
    process.exit(1);
  }
  if (Date.now() - started >= waitMs) {
    console.error(keep ? `Deployment to keep is still ${keep.state} after waiting; deleting nothing.` : `Deployment to keep (${keepRaw ?? sha}) not found; deleting nothing.`);
    process.exit(1);
  }
  console.log(keep ? `Waiting: ${keep.url} is ${keep.state}…` : 'Waiting for Vercel to create the production deployment…');
  await new Promise((r) => setTimeout(r, 15000));
}

const old = selectOld(all, keep);
console.log(`Keeping ${keep.url} (${keep.uid}). ${old.length} older deployment(s) to delete${dry ? ' [dry run]' : ''}.`);

let failed = 0;
for (const d of old) {
  if (dry) {
    console.log(`  would delete ${d.url} (${d.target ?? 'preview'}, ${d.state})`);
    continue;
  }
  try {
    await call('DELETE', `/v13/deployments/${d.uid}`);
    console.log(`  deleted ${d.url}`);
  } catch (e) {
    failed++;
    console.error(`  failed ${d.url}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
