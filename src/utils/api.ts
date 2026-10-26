/** Same-origin Vercel functions in production; set VITE_API_BASE to hit a deployed API from `npm run dev`. */
export const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

export const globalEnabled = (): boolean => import.meta.env.PROD || Boolean(API);

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(`${API}${path}`, { ...init, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...init.headers } });
    if (!res.ok) throw new Error(`${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}
