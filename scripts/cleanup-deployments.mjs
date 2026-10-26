#!/usr/bin/env node
/**
 * Delete every Vercel deployment of this project that is OLDER than the one to keep.
 *
 *   VERCEL_TOKEN=… VERCEL_PROJECT_ID=… [VERCEL_TEAM_ID=…] KEEP_DEPLOYMENT=<url|dpl_id> \
 *     node scripts/cleanup-deployments.mjs [--dry-run]
 *
 * Safety rails: it refuses to delete anything unless the deployment to keep is found
 * and READY, and it never touches deployments newer than it (e.g. a build in flight).
 * Project/team ids fall back to .vercel/project.json (created by `vercel link`).
 */
import { readFileSync } from 'node:fs';

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

if (!token || !projectId || !keepRaw) {
  console.error('Need VERCEL_TOKEN, VERCEL_PROJECT_ID (or .vercel/project.json) and KEEP_DEPLOYMENT.');
  process.exit(1);
}

const keepHost = keepRaw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const q = (extra = {}) => new URLSearchParams({ ...(teamId && teamId.startsWith('team_') ? { teamId } : {}), ...extra }).toString();
const call = async (method, path, params) => {
  const res = await fetch(`${API}${path}?${q(params)}`, { method, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const all = [];
let until;
do {
  const page = await call('GET', '/v6/deployments', { projectId, limit: '100', ...(until ? { until: String(until) } : {}) });
  all.push(...page.deployments);
  until = page.pagination?.next;
} while (until);

const keep = all.find((d) => d.uid === keepRaw || d.url === keepHost);
if (!keep) {
  console.error(`Deployment to keep (${keepRaw}) not found in project; deleting nothing.`);
  process.exit(1);
}
if (keep.state !== 'READY') {
  console.error(`Deployment to keep is ${keep.state}, not READY; deleting nothing.`);
  process.exit(1);
}

const old = all.filter((d) => d.uid !== keep.uid && d.created < keep.created);
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
