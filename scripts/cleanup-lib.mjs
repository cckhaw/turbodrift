/** Pure helpers for scripts/cleanup-deployments.mjs (kept separate so they can be unit-tested). */

/** The deployment to keep: by id/hostname, or the production deployment built from a commit. */
export function findKeep(deployments, { keep, sha }) {
  if (keep) {
    const host = keep.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return deployments.find((d) => d.uid === keep || d.url === host) ?? null;
  }
  if (sha) {
    return deployments.find((d) => d.target === 'production' && d.meta?.githubCommitSha === sha) ?? null;
  }
  return null;
}

/** Everything strictly older than the deployment we keep (never a newer one, e.g. a build in flight). */
export const selectOld = (deployments, keep) => deployments.filter((d) => d.uid !== keep.uid && d.created < keep.created);

/** What to do about the deployment we are waiting for. */
export function judge(keep) {
  if (!keep) return 'wait'; // not created yet
  if (keep.state === 'READY') return 'go';
  if (['ERROR', 'CANCELED', 'DELETED'].includes(keep.state)) return 'abort';
  return 'wait'; // QUEUED / INITIALIZING / BUILDING
}
