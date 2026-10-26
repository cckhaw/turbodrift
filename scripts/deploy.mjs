#!/usr/bin/env node
/**
 * Production-only deploy. There is intentionally no preview mode.
 * After the production deployment succeeds, every older deployment is deleted.
 *
 *   npm run deploy            (needs the Vercel CLI login or VERCEL_TOKEN; run `npx vercel link` once)
 */
import { spawnSync } from 'node:child_process';

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], ...opts });

const tokenArgs = process.env.VERCEL_TOKEN ? ['--token', process.env.VERCEL_TOKEN] : [];
const dep = run('npx', ['--yes', 'vercel@latest', 'deploy', '--prod', '--yes', ...tokenArgs]);
if (dep.status !== 0) {
  console.error('Production deploy failed; nothing was deleted.');
  process.exit(dep.status ?? 1);
}
const url = dep.stdout.trim().split('\n').pop();
console.log(`Production deployed: ${url}`);

const clean = spawnSync('node', ['scripts/cleanup-deployments.mjs'], { stdio: 'inherit', env: { ...process.env, KEEP_DEPLOYMENT: url } });
process.exit(clean.status ?? 1);
