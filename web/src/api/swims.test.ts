import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setIdToken } from '@/api/auth-token';
import { ApiError, fetchSwimBlob, getSwim, listSwims } from '@/api/swims';

describe('swims API client', () => {
  beforeEach(() => {
    setIdToken('token123');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setIdToken(undefined);
    vi.unstubAllGlobals();
  });

  it('listSwims fetches /swims with an Authorization header', async () => {
    const swims = [{ swimId: 'a' }];
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ swims }), { status: 200 }));

    const result = await listSwims();

    expect(result).toEqual(swims);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/swims$/);
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.authorization).toBe('Bearer token123');
  });

  it('listSwims throws ApiError on a non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(listSwims()).rejects.toThrow(ApiError);
  });

  it('getSwim fetches the swim and download URL', async () => {
    const swim = { swimId: 'a' };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ swim, downloadUrl: 'https://s3/x' }), { status: 200 }),
    );

    const result = await getSwim('a');

    expect(result.swim).toEqual(swim);
    expect(result.downloadUrl).toBe('https://s3/x');
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/swims\/a$/);
  });

  it('fetchSwimBlob fetches the presigned URL directly, no auth header', async () => {
    const blob = { schemaVersion: 1 };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(blob), { status: 200 }));

    const result = await fetchSwimBlob('https://s3/presigned');

    expect(result).toEqual(blob);
    expect(fetch).toHaveBeenCalledWith('https://s3/presigned');
  });

  it('fetchSwimBlob throws ApiError on a non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('gone', { status: 404 }));
    await expect(fetchSwimBlob('https://s3/presigned')).rejects.toThrow(ApiError);
  });
});
