import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchCountries } from './searchCountries';
import { HttpError } from './HttpError';

describe('HttpError', () => {
  it('is an instance of Error', () => {
    const err = new HttpError(500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttpError);
  });

  it('stores the status', () => {
    const err = new HttpError(404);
    expect(err.status).toBe(404);
  });

  it('has a default message derived from the status', () => {
    const err = new HttpError(500);
    expect(err.message).toContain('500');
  });

  it('accepts a custom message', () => {
    const err = new HttpError(500, 'boom');
    expect(err.message).toBe('boom');
  });

  it('has name "HttpError"', () => {
    const err = new HttpError(500);
    expect(err.name).toBe('HttpError');
  });
});

describe('searchCountries', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on success', async () => {
    const payload = [{ name: 'Spain' }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });

    const result = await searchCountries('spain', new AbortController().signal);

    expect(result).toEqual(payload);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('calls fetch with the encoded query in the URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    await searchCountries('united states', new AbortController().signal);

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent('united states'));
  });

  it('returns [] on 404', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await searchCountries('nonexistent', new AbortController().signal);

    expect(result).toEqual([]);
  });

  it('throws HttpError on 500', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(searchCountries('test', new AbortController().signal)).rejects.toThrow(HttpError);
  });

  it('HttpError thrown on 500 carries status 500', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(searchCountries('test', new AbortController().signal)).rejects.toMatchObject({
      status: 500,
    });
  });

  it('passes the signal through to fetch', async () => {
    const controller = new AbortController();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    await searchCountries('test', controller.signal);

    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it('rejects with AbortError when aborted', async () => {
    const controller = new AbortController();
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const promise = searchCountries('test', controller.signal);
    controller.abort();

    await expect(promise).rejects.toThrowError(expect.objectContaining({ name: 'AbortError' }));
  });

  it('rejects with TimeoutError when timeout signal aborts', async () => {
    const timeoutSignal = AbortSignal.timeout(10);
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const reason = (init.signal as AbortSignal).reason;
            reject(reason);
          });
        }),
    );

    await expect(searchCountries('test', timeoutSignal)).rejects.toThrowError(
      expect.objectContaining({ name: 'TimeoutError' }),
    );
  });
});
