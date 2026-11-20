/**
 * Unit tests for the typed API client (src/lib/api/client.ts).
 *
 * Covers the scenarios required by #1532:
 *  - successful request returns parsed JSON
 *  - 401 with a refresh token retries once with the refreshed token
 *  - 401 without refresh invokes onUnauthorized and rejects
 *  - network failure (fetch rejects) throws an ApiError of kind "network"
 *  - abort signal throws an ApiError of kind "abort"
 *  - transient 5xx responses are retried up to the configured limit
 *  - the convenience helpers (get/post/put/patch/delete) delegate correctly
 */
import {
  apiRequest,
  apiClient,
  ApiError,
  setAuthContext,
  type AuthContext,
} from '@/lib/api/client';

// ── fetch mock ────────────────────────────────────────────────────────────────

const fetchMock = jest.fn() as unknown as jest.Mock;

beforeAll(() => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
});

beforeEach(() => {
  fetchMock.mockReset();
  setAuthContext(null);
});

function jsonResponse(body: unknown, init?: Partial<Response>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function nonOkResponse(
  status: number,
  body: unknown = { message: `failed ${status}` }
): Response {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// ── success ────────────────────────────────────────────────────────────────────

describe('apiRequest — success', () => {
  it('parses and returns JSON for a successful GET', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1, name: 'loan' }));
    const data = await apiRequest<{ id: number; name: string }>('/api/v1/loans/1');
    expect(data).toEqual({ id: 1, name: 'loan' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('GET');
  });

  it('attaches a JSON Content-Type header when a body is supplied', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiRequest('/api/v1/loans', { method: 'POST', body: { amount: 100 } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ amount: 100 }));
    expect(init.headers.get('Content-Type')).toBe('application/json');
  });

  it('does not attach an Authorization header when skipAuth is true', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiRequest('/public/health', { skipAuth: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get('Authorization')).toBeNull();
  });

  it('attaches the auth token from the registered auth context', async () => {
    setAuthContext({ getToken: () => 'token-abc' } as AuthContext);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiRequest('/api/v1/loans');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get('Authorization')).toBe('Bearer token-abc');
  });
});

// ── 401 handling ──────────────────────────────────────────────────────────────

describe('apiRequest — 401 unauthorized', () => {
  it('refreshes the token once and retries successfully when refreshToken succeeds', async () => {
    let refreshed = false;
    const onUnauthorized = jest.fn();
    setAuthContext({
      getToken: () => 'stale-token',
      refreshToken: async () => {
        refreshed = true;
        return 'fresh-token';
      },
      onUnauthorized,
    } as AuthContext);

    fetchMock
      .mockResolvedValueOnce(nonOkResponse(401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const data = await apiRequest('/api/v1/loans');
    expect(data).toEqual({ ok: true });
    expect(refreshed).toBe(true);
    // Second call must use the refreshed bearer.
    const [, init] = fetchMock.mock.calls[1];
    expect(init.headers.get('Authorization')).toBe('Bearer fresh-token');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('invokes onUnauthorized and rejects when there is no refresh token', async () => {
    const onUnauthorized = jest.fn();
    setAuthContext({ getToken: () => 'stale', onUnauthorized } as AuthContext);
    fetchMock.mockResolvedValue(nonOkResponse(401, { message: 'token expired' }));

    await expect(apiRequest('/api/v1/loans')).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('invokes onUnauthorized when the refresh returns null', async () => {
    const onUnauthorized = jest.fn();
    setAuthContext({
      getToken: () => 'stale',
      refreshToken: async () => null,
      onUnauthorized,
    } as AuthContext);
    fetchMock.mockResolvedValue(nonOkResponse(401));

    await expect(apiRequest('/api/v1/loans')).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

// ── network & abort ───────────────────────────────────────────────────────────

describe('apiRequest — network and abort errors', () => {
  it('throws an ApiError of kind "network" when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiRequest('/api/v1/loans')).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('/api/v1/loans')).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('throws an ApiError of kind "abort" when the request is aborted', async () => {
    const abortError = new DOMException('aborted', 'AbortError');
    fetchMock.mockRejectedValue(abortError);
    await expect(
      apiRequest('/api/v1/loans', { signal: new AbortController().signal })
    ).rejects.toMatchObject({ kind: 'abort' });
  });
});

// ── retry on transient 5xx ────────────────────────────────────────────────────

describe('apiRequest — retry behaviour', () => {
  it('retries a 503 once then succeeds (retries default = 2)', async () => {
    fetchMock
      .mockResolvedValueOnce(nonOkResponse(503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const data = await apiRequest('/api/v1/loans');
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws an http ApiError after exhausting retries', async () => {
    fetchMock.mockResolvedValue(nonOkResponse(503, { message: 'down' }));
    await expect(apiRequest('/api/v1/loans', { retries: 1 })).rejects.toMatchObject({
      kind: 'http',
      status: 503,
    });
    // 1 initial + 1 retry
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable 4xx error', async () => {
    fetchMock.mockResolvedValue(nonOkResponse(400, { message: 'bad input' }));
    await expect(apiRequest('/api/v1/loans')).rejects.toMatchObject({
      kind: 'http',
      status: 400,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── convenience helpers ───────────────────────────────────────────────────────

describe('apiClient — convenience helpers', () => {
  it('get issues a GET request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiClient.get('/api/v1/loans');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it('post issues a POST request with a body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiClient.post('/api/v1/loans', { amount: 5 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ amount: 5 }));
  });

  it('put, patch, and delete map to the correct methods', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await apiClient.put('/api/v1/loans/1', { a: 1 });
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');

    fetchMock.mockClear();
    await apiClient.patch('/api/v1/loans/1', { a: 1 });
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');

    fetchMock.mockClear();
    await apiClient.delete('/api/v1/loans/1');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });
});
