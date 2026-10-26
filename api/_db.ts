import { neon } from '@neondatabase/serverless';
import type { Sql } from './_core.js';

/** Neon's Vercel integration injects DATABASE_URL (pooled). */
export function getSql(): Sql {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url) as unknown as Sql;
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
