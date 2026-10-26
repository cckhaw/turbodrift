import { verifyReplay } from '../src/game/verify.js';
import { submitScore } from './_core.js';
import { getSql, json } from './_db.js';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  try {
    const r = await submitScore(getSql(), body, verifyReplay);
    return json(r.body, r.status);
  } catch (e) {
    console.error('score', e);
    return json({ error: 'unavailable' }, 503);
  }
}
