import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, tokenStore } from './api';
import { ago, phone, som } from './format';

function json(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Bearer token va JSON body yuboradi', async () => {
    tokenStore.set({ accessToken: 'A1', refreshToken: 'R1' });
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await api('/x', { body: { a: 1 }, query: { q: 'kr', empty: '', none: undefined } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/x?q=kr');
    expect(init!.method).toBe('POST');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer A1');
    expect(init!.body).toBe('{"a":1}');
  });

  it('xato javobni ApiError ga aylantiradi', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: { code: 'INSUFFICIENT_STOCK', message: 'yo\'q', details: { x: 1 } } }));
    const err = await api('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK', details: { x: 1 } });
  });

  it('401 → refresh → qayta urinish', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'R1' });
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED' } }))
      .mockResolvedValueOnce(json(200, { accessToken: 'new', refreshToken: 'R2' }))
      .mockResolvedValueOnce(json(200, { id: 1 }));
    await expect(api('/me')).resolves.toEqual({ id: 1 });
    expect(tokenStore.get()).toEqual({ accessToken: 'new', refreshToken: 'R2' });
    expect((fetchMock.mock.calls[2]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer new');
  });

  it('bir vaqtdagi ikki 401 — bitta refresh so\'rovi', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'R1' });
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { accessToken: 'new', refreshToken: 'R2' });
      }
      const auth = (init!.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new' ? json(200, { ok: url }) : json(401, {});
    });
    await Promise.all([api('/a'), api('/b')]);
    expect(refreshCalls).toBe(1);
  });

  it('refresh muvaffaqiyatsiz — tokenlar o\'chiriladi', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'R1' });
    const seen: unknown[] = [];
    const unsub = tokenStore.subscribe((t) => seen.push(t));
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, {}));
    await expect(api('/me')).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.get()).toBeNull();
    expect(seen).toEqual([null]);
    unsub();
  });

  it('/auth/* da 401 refresh qilmaydi', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'OTP_INVALID' } }));
    await expect(api('/auth/otp/verify', { body: {} })).rejects.toMatchObject({ code: 'OTP_INVALID' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('format', () => {
  it('som', () => {
    expect(som(4_620_000)).toBe('4 620 000 so\'m');
    expect(som(0)).toBe('0 so\'m');
    expect(som(null)).toBe('—');
  });
  it('phone', () => expect(phone('+998901234567')).toBe('+998 90 123 45 67'));
  it('ago', () => {
    const now = Date.parse('2026-11-03T12:00:00Z');
    expect(ago('2026-11-03T11:59:40Z', now)).toBe('hozir');
    expect(ago('2026-11-03T11:15:00Z', now)).toBe('45 daq');
    expect(ago('2026-11-03T07:00:00Z', now)).toBe('5 soat');
    expect(ago('2026-11-01T12:00:00Z', now)).toBe('2 kun');
  });
});
