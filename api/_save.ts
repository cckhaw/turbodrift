import { isCleanName } from '../src/utils/profanity.js';
/* Cloud save: progress that follows a player across devices via a secret sync code (no accounts). */
import type { Result, Sql } from './_core.js';
import { ensureSchema } from './_core.js';

export interface SaveData {
  unlocked: number; // highest unlocked world, 1..WORLD_COUNT
  medals: Record<string, number>; // world -> best finishing place
  days: string[]; // YYYY-MM-DD daily challenges completed
  name: string;
  kart: string;
}

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/;
const KARTS = ['comet', 'rocket', 'phantom'];
/** Keep in step with WORLDS in src/game/worlds.ts (a test checks it). */
export const WORLD_COUNT = 5;
const CREATE_THROTTLE_SECONDS = 60;
const bad = (error: string, status = 400): Result => ({ status, body: { error } });

export const normalizeCode = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return CODE_RE.test(c) ? c : null;
};

export function makeCode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < 12; i++) out += CODE_ALPHABET[bytes[i] & 31];
  return out;
}

/** Strict parse: unknown shapes are rejected rather than stored. */
export function parseSave(input: unknown): SaveData | null {
  const r = (input && typeof input === 'object' ? input : null) as Record<string, unknown> | null;
  if (!r) return null;
  const { unlocked, medals, days, name, kart } = r;
  if (typeof unlocked !== 'number' || !Number.isInteger(unlocked) || unlocked < 1 || unlocked > WORLD_COUNT) return null;
  if (!medals || typeof medals !== 'object' || Array.isArray(medals)) return null;
  const m: Record<string, number> = {};
  for (const [k, v] of Object.entries(medals as Record<string, unknown>)) {
    const w = Number(k);
    if (!Number.isInteger(w) || w < 1 || w > WORLD_COUNT || typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 6) return null;
    m[String(w)] = v;
  }
  if (!Array.isArray(days) || days.length > 90 || !days.every((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) return null;
  if (typeof name !== 'string' || name.length > 12) return null;
  // eslint-disable-next-line no-control-regex
  const trimmed = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const cleanName = trimmed && isCleanName(trimmed) ? trimmed : 'YOU';
  if (typeof kart !== 'string' || !KARTS.includes(kart)) return null;
  return { unlocked, medals: m, days: Array.from(new Set(days as string[])).sort(), name: cleanName, kart };
}

/** Progress only ever moves forward, so a stale device can't undo another device's unlocks. */
export function mergeSaves(a: SaveData, b: SaveData): SaveData {
  const medals: Record<string, number> = { ...a.medals };
  for (const [k, v] of Object.entries(b.medals)) medals[k] = Math.min(medals[k] ?? 99, v);
  return { unlocked: Math.max(a.unlocked, b.unlocked), medals, days: Array.from(new Set([...a.days, ...b.days])).sort().slice(-90), name: b.name, kart: b.kart };
}

export async function createSave(sql: Sql, input: unknown, ipHash: string, code: string): Promise<Result> {
  const data = parseSave(input);
  if (!data) return bad('bad save');
  await ensureSchema(sql);
  const recent = await sql`select 1 from saves where ip_hash = ${ipHash} and created_at > now() - make_interval(secs => ${CREATE_THROTTLE_SECONDS}) limit 1`;
  if (recent.length) return bad('slow down', 429);
  await sql`insert into saves (code, data, ip_hash) values (${code}, ${JSON.stringify(data)}::jsonb, ${ipHash})`;
  return { status: 200, body: { code, save: data } };
}

export async function getSave(sql: Sql, rawCode: unknown): Promise<Result> {
  const code = normalizeCode(rawCode);
  if (!code) return bad('bad code');
  await ensureSchema(sql);
  const rows = await sql`select data from saves where code = ${code}`;
  if (!rows.length) return bad('not found', 404);
  return { status: 200, body: { save: rows[0].data } };
}

export async function putSave(sql: Sql, rawCode: unknown, input: unknown): Promise<Result> {
  const code = normalizeCode(rawCode);
  const data = parseSave(input);
  if (!code) return bad('bad code');
  if (!data) return bad('bad save');
  await ensureSchema(sql);
  const rows = await sql`select data from saves where code = ${code}`;
  if (!rows.length) return bad('not found', 404);
  const merged = mergeSaves(parseSave(rows[0].data) ?? data, data);
  await sql`update saves set data = ${JSON.stringify(merged)}::jsonb, updated_at = now() where code = ${code}`;
  return { status: 200, body: { save: merged } };
}
