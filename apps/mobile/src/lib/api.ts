import { API_BASE } from './config';
import { secureStorage } from './storage';

/**
 * API client: Bearer token, 401 da bir marta refresh (bir vaqtda — bitta so'rov).
 * Tokenlar xotirada ham saqlanadi — har so'rovda SecureStore'ni o'qimaslik uchun.
 */

const KEY = 'mebel.tokens';

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

let current: Tokens | null = null;
let loaded = false;
const listeners = new Set<(t: Tokens | null) => void>();

export const tokens = {
  async load() {
    if (!loaded) {
      const raw = await secureStorage.get(KEY);
      current = raw ? (JSON.parse(raw) as Tokens) : null;
      loaded = true;
    }
    return current;
  },
  get: () => current,
  async set(t: Tokens | null) {
    current = t;
    loaded = true;
    await secureStorage.set(KEY, t ? JSON.stringify(t) : null);
    listeners.forEach((l) => l(t));
  },
  subscribe(l: (t: Tokens | null) => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  if (!current) return false;
  const refreshToken = current.refreshToken;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await tokens.set(null);
        return false;
      }
      await tokens.set((await res.json()) as Tokens);
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
  form?: FormData;
}

function url(path: string, query?: RequestOptions['query']) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, o: RequestOptions) {
  const headers: Record<string, string> = { Accept: 'application/json', ...o.headers };
  if (current) headers.Authorization = `Bearer ${current.accessToken}`;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(o.body);
  }
  return fetch(url(path, o.query), { method: o.method ?? (body ? 'POST' : 'GET'), headers, body });
}

export async function api<T = unknown>(path: string, o: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, o);
    if (res.status === 401 && !path.startsWith('/auth/') && (await refresh())) res = await send(path, o);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Internet aloqasi yo\'q');
  }
  if (!res.ok) {
    let err: { code?: string; message?: string; details?: unknown } = {};
    try {
      err = ((await res.json()) as { error?: typeof err }).error ?? {};
    } catch {
      // JSON emas
    }
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message ?? 'Xatolik', err.details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Yopiq fayl (chek, chat rasmi) uchun: <Image source={{ uri, headers }} /> */
export function authedSource(path: string) {
  return { uri: `${API_BASE}${path}`, headers: current ? { Authorization: `Bearer ${current.accessToken}` } : undefined };
}

/** Rasm/PDF yuklash: RN'da FormData { uri, name, type } qabul qiladi, webda — Blob */
export async function fileToForm(file: { uri: string; name: string; mimeType: string; file?: Blob }) {
  const form = new FormData();
  if (file.file) form.append('file', file.file, file.name);
  else form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  return form;
}
