import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchController, type SearchState } from './searchController';
import { resetCache } from './utils/cache.js';

describe('SearchController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    resetCache();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('initializes with idle state', () => {
    const states: SearchState[] = [];
    new SearchController((s) => states.push(s));
    expect(states).toEqual([{ status: 'idle' }]);
  });

  it('does not search when the query is empty', () => {
    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    controller.updateQuery('');

    expect(states[1]).toEqual({ status: 'idle' });
  });

  it('sets loading state and searches after debounce', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ name: 'Spain' }],
    });

    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    controller.updateQuery('spain');

    // Before debounce: loading
    expect(states).toContainEqual({ status: 'loading' });

    // After debounce: success
    await vi.advanceTimersByTimeAsync(300);

    const successState = states.find((s) => s.status === 'success');
    expect(successState).toBeTruthy();
    expect(successState!.status).toBe('success');
  });

  it('aborts previous request on new input', async () => {
    const controller = new SearchController(() => {});

    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve({ ok: true, status: 200, json: async () => [] }),
            1000,
          );
          init.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    controller.updateQuery('first');
    await vi.advanceTimersByTimeAsync(10);

    // New query should abort the pending one
    controller.updateQuery('second');

    // Advance past the first request's timeout — it should not resolve
    await vi.advanceTimersByTimeAsync(1000);
  });

  it('returns empty when 404 is received', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    controller.updateQuery('nonexistent');
    await vi.advanceTimersByTimeAsync(300);

    const emptyState = states.find((s) => s.status === 'empty');
    expect(emptyState).toBeTruthy();
  });

  it('sets error state on HttpError (500)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    controller.updateQuery('test');
    await vi.advanceTimersByTimeAsync(300);

    const errorState = states.find((s) => s.status === 'error');
    expect(errorState).toBeTruthy();
    expect(errorState!.status).toBe('error');
  });

  it('does not show error on AbortError (user cancellation)', async () => {
    const controller = new SearchController(() => {});

    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    controller.updateQuery('first');
    await vi.advanceTimersByTimeAsync(10);

    const states: SearchState[] = [];
    const ctrl = new SearchController((s) => states.push(s));

    ctrl.updateQuery('first');
    await vi.advanceTimersByTimeAsync(10);
    ctrl.updateQuery(''); // clears, should abort and not show error

    const errorState = states.find((s) => s.status === 'error');
    expect(errorState).toBeUndefined();
  });

  it('retry re-sends the last query', async () => {
    const fetchCalls: string[] = [];
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, _init: RequestInit) => {
      fetchCalls.push(url);
      return Promise.resolve({ ok: false, status: 500 });
    });

    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    controller.updateQuery('retry-me');
    await vi.advanceTimersByTimeAsync(300);

    const errorState = states.find((s) => s.status === 'error');
    expect(errorState).toBeTruthy();

    fetchCalls.length = 0;
    controller.retry();
    await vi.advanceTimersByTimeAsync(300);

    const secondError = states.filter((s) => s.status === 'error');
    expect(secondError.length).toBe(2);
  });
});
