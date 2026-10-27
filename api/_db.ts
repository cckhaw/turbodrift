import { neon } from '@neondatabase/serverless';
import type { Sql } from './_core.js';

/** Neon's Vercel integration injects DATABASE_URL (pooled). */
let cached: { url: string; sql: Sql } | null = null;

/** One client per warm function instance, so schema setup (api/_core.ts) runs once rather than on every request. */
export function getSql(): Sql {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (cached?.url !== url) cached = { url, sql: neon(url) as unknown as Sql };
  return cached.sql;
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
