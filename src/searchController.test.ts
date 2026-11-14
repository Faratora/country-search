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

  it('keeps the empty state when an empty result is served from the cache', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    // First empty query goes to the network and caches [].
    controller.updateQuery('first-empty');
    await vi.advanceTimersByTimeAsync(300);
    expect(states[states.length - 1]).toEqual({ status: 'empty' });

    // Another query populates the cache with a different entry.
    controller.updateQuery('second-empty');
    await vi.advanceTimersByTimeAsync(300);
    expect(states[states.length - 1]).toEqual({ status: 'empty' });

    // The third query is served from the cache. [] must still mean
    // "nothing found", not "success with zero results".
    controller.updateQuery('first-empty');
    await vi.advanceTimersByTimeAsync(0);

    expect(states[states.length - 1]).toEqual({ status: 'empty' });
    expect(fetch).toHaveBeenCalledTimes(2);
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

  it('sets timeout error state when the request times out', async () => {
    // Real fetch rejects with a TimeoutError DOMException when the
    // AbortSignal.timeout signal fires. We simulate that directly here,
    // because Node's internal timeout timer behind AbortSignal.timeout is
    // not controlled by vitest fake timers.
    const TIMEOUT_DELAY_MS = 8000;

    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, _init: RequestInit) =>
        new Promise((_resolve, reject) => {
          setTimeout(
            () => reject(new DOMException('The operation timed out', 'TimeoutError')),
            TIMEOUT_DELAY_MS,
          );
        }),
    );

    const states: SearchState[] = [];
    new SearchController((s) => states.push(s)).updateQuery('slow-country');

    // Debounce fires, then the request times out
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(TIMEOUT_DELAY_MS);

    const errorState = states.find((s) => s.status === 'error' && s.message.includes('timed out'));
    expect(errorState).toBeTruthy();
    expect(errorState!.status).toBe('error');
    if (errorState!.status === 'error') {
      expect(errorState!.message).toBe('Request timed out. Please try again.');
      expect(errorState!.query).toBe('slow-country');
    }
  });

  it('distinguishes TimeoutError from AbortError (user cancellation)', async () => {
    // The same signal-driven mock as real fetch: it rejects with whatever
    // reason aborted the signal — AbortError for our own AbortController,
    // TimeoutError for AbortSignal.timeout.
    const hangingFetch = (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init.signal;
        if (!signal) {
          reject(new Error('No signal passed to fetch'));
          return;
        }
        const onAbort = () => {
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      });

    // Case 1: TimeoutError reaches the controller → timeout error state.
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, _init: RequestInit) =>
        new Promise((_resolve, reject) => {
          setTimeout(
            () => reject(new DOMException('The operation timed out', 'TimeoutError')),
            1000,
          );
        }),
    );

    const timeoutStates: SearchState[] = [];
    new SearchController((s) => timeoutStates.push(s)).updateQuery('slow');
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(1000);

    const timeoutError = timeoutStates.find((s) => s.status === 'error');
    expect(timeoutError).toBeTruthy();
    if (timeoutError?.status === 'error') {
      expect(timeoutError.message).toBe('Request timed out. Please try again.');
    }

    // Case 2: AbortError (user cancellation) → NO error state at all.
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(hangingFetch);

    const cancelStates: SearchState[] = [];
    const controller = new SearchController((s) => cancelStates.push(s));

    controller.updateQuery('spain');
    await vi.advanceTimersByTimeAsync(300); // request in flight

    controller.updateQuery(''); // user clears the field → AbortError

    await vi.advanceTimersByTimeAsync(1000);

    expect(cancelStates.find((s) => s.status === 'error')).toBeUndefined();
    expect(cancelStates[cancelStates.length - 1]).toEqual({ status: 'idle' });
  });

  it('regression: clearing the field during debounce does NOT send a request', async () => {
    const queriesFetched: string[] = [];

    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      const query = url.split('/').pop()!;
      queriesFetched.push(query);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [{ name: 'France', population: 67000000 }],
      });
    });

    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    // t=0: user types 'sp'
    controller.updateQuery('sp');

    // t=100: user clears the field (BEFORE the 300ms debounce fires)
    await vi.advanceTimersByTimeAsync(100);
    controller.updateQuery('');

    // t=400: debounce WOULD have fired at t=300 if not cancelled
    await vi.advanceTimersByTimeAsync(300);

    expect(queriesFetched).toEqual([]);
    const lastState = states[states.length - 1];
    expect(lastState).toEqual({ status: 'idle' });
  });

  it('timeout still works when AbortSignal.any is unavailable (fallback path)', async () => {
    // Simulate an older engine without AbortSignal.any. The fallback must
    // still compose the cancellation + timeout sources, so the request is
    // aborted with a TimeoutError once REQUEST_TIMEOUT_MS elapses.
    const originalAny = AbortSignal.any;
    // @ts-expect-error deliberately removing the API for this test
    AbortSignal.any = undefined;

    try {
      // Real-fetch-like mock: rejects with the signal's abort reason.
      (fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init.signal;
            if (!signal) {
              reject(new Error('No signal passed to fetch'));
              return;
            }
            const onAbort = () => {
              reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
            };
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
          }),
      );

      const states: SearchState[] = [];
      new SearchController((s) => states.push(s)).updateQuery('slow-fallback');

      // Debounce fires, request goes out and hangs...
      await vi.advanceTimersByTimeAsync(300);
      expect(states[states.length - 1]).toEqual({ status: 'loading' });

      // ...the fallback setTimeout aborts it with TimeoutError at 8000ms.
      await vi.advanceTimersByTimeAsync(8000);

      const errorState = states.find((s) => s.status === 'error');
      expect(errorState).toBeTruthy();
      if (errorState?.status === 'error') {
        expect(errorState.message).toBe('Request timed out. Please try again.');
        expect(errorState.query).toBe('slow-fallback');
      }
    } finally {
      AbortSignal.any = originalAny;
    }
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

  it('retry shows the loading indicator while the request is in flight', async () => {
    let mode: 'fail' | 'hang' = 'fail';
    let resolveFetch: ((value: unknown) => void) | undefined;

    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      if (mode === 'fail') {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });

    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    controller.updateQuery('flaky');
    await vi.advanceTimersByTimeAsync(300);

    expect(states[states.length - 1].status).toBe('error');

    mode = 'hang';
    states.length = 0;
    controller.retry();

    // Loading must appear immediately, not only after the response arrives.
    expect(states[states.length - 1]).toEqual({ status: 'loading' });

    // ...and the old error UI is gone while the request is still in flight.
    expect(states.some((s) => s.status === 'error')).toBe(false);

    // Finish the retried request.
    resolveFetch?.({
      ok: true,
      status: 200,
      json: async () => [{ name: 'Spain', population: 1 }],
    });
    await vi.advanceTimersByTimeAsync(0);

    const finalState = states[states.length - 1];
    expect(finalState.status).toBe('success');
  });

  it('retry does nothing when there is no previous query', () => {
    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    controller.retry();

    expect(fetch).not.toHaveBeenCalled();
    expect(states).toEqual([{ status: 'idle' }]);
  });
});
