/**
 * API client: Bearer token, 401 da refresh token bilan bir marta yangilab qayta urinish.
 * Bir vaqtda kelgan bir nechta 401 — bitta refresh so'rovi (single-flight).
 */

/** API serveri. Bo'sh — bitta origin (dev proxy yoki API web'ni o'zi beradi); Vercel'da — Render manzili */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const API_BASE = `${API_URL}/api/v1`;

/** API qaytargan nisbiy fayl yo'li (/uploads/...) — API serveridan */
export const fileUrl = (url: string) => (url.startsWith('/') ? `${API_URL}${url}` : url);
const STORAGE_KEY = 'mebel.admin.tokens';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Listener = (t: Tokens | null) => void;
const listeners = new Set<Listener>();

export const tokenStore = {
  get(): Tokens | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(t: Tokens | null) {
    if (t) localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    else localStorage.removeItem(STORAGE_KEY);
    listeners.forEach((l) => l(t));
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const current = tokenStore.get();
  if (!current) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) {
        tokenStore.set(null);
        return false;
      }
      tokenStore.set((await res.json()) as Tokens);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  /** multipart (fayl yuklash) */
  form?: FormData;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const t = tokenStore.get();
  const headers: Record<string, string> = { ...opts.headers };
  if (t) headers.Authorization = `Bearer ${t.accessToken}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  return fetch(buildUrl(path, opts.query), { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
}

/** Faqat token eskirganda yangilaymiz — "parol noto'g'ri" kabi 401 xatolar qayta yuborilmaydi */
async function isTokenError(res: Response) {
  try {
    const code = ((await res.clone().json()) as { error?: { code?: string } }).error?.code;
    return !code || code === 'UNAUTHORIZED';
  } catch {
    return true;
  }
}

async function request(path: string, opts: RequestOptions): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && !path.startsWith('/auth/') && (await isTokenError(res)) && (await refresh())) {
    res = await send(path, opts);
  }
  if (!res.ok) {
    let err: { code?: string; message?: string; details?: unknown } = {};
    try {
      err = ((await res.json()) as { error?: typeof err }).error ?? {};
    } catch {
      // javob JSON emas
    }
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message ?? res.statusText, err.details);
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Yopiq fayl (chek, chat ilovasi) — <img src> token yubora olmaydi, shuning uchun blob URL */
export async function apiBlobUrl(path: string): Promise<string> {
  const res = await request(path, {});
  return URL.createObjectURL(await res.blob());
}

/** Excel kabi fayllarni yuklab olish */
export async function apiDownload(path: string, filename: string) {
  const url = await apiBlobUrl(path);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
