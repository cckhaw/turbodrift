import { renamePlayer } from './_core.js';
import { getSql, json } from './_db.js';

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  try {
    const r = await renamePlayer(getSql(), body);
    return json(r.body, r.status);
  } catch (e) {
    console.error('rename', e);
    return json({ error: 'unavailable' }, 503);
  }
}
