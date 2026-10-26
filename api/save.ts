import { createHash, randomBytes } from 'node:crypto';
import { createSave, getSave, makeCode, putSave } from './_save.js';
import { getSql, json } from './_db.js';

const ipHash = (request: Request): string => {
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  return createHash('sha256').update(`turbodrift:${ip}`).digest('hex').slice(0, 32);
};

async function body(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

const fail = (e: unknown, tag: string) => {
  console.error(tag, e);
  return json({ error: 'unavailable' }, 503);
};

/** Restore: GET /api/save?code=XXXX */
export async function GET(request: Request): Promise<Response> {
  try {
    const r = await getSave(getSql(), new URL(request.url).searchParams.get('code'));
    return json(r.body, r.status);
  } catch (e) {
    return fail(e, 'save get');
  }
}

/** Create a new cloud save and return its sync code. */
export async function POST(request: Request): Promise<Response> {
  const b = await body(request);
  if (b === undefined) return json({ error: 'bad json' }, 400);
  try {
    const r = await createSave(getSql(), b, ipHash(request), makeCode(randomBytes(12)));
    return json(r.body, r.status);
  } catch (e) {
    return fail(e, 'save create');
  }
}

/** Update an existing save: { code, save }. The server merges, so progress never moves backwards. */
export async function PUT(request: Request): Promise<Response> {
  const b = (await body(request)) as { code?: unknown; save?: unknown } | undefined;
  if (!b) return json({ error: 'bad json' }, 400);
  try {
    const r = await putSave(getSql(), b.code, b.save);
    return json(r.body, r.status);
  } catch (e) {
    return fail(e, 'save put');
  }
}
