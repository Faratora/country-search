import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchController, type SearchState } from './searchController';
import { resetCache } from './utils/cache.js';

/**
 * Race-condition tests.
 *
 * The mock fetch is required to reject its promise with AbortError when
 * abort() is called on the passed signal — otherwise these tests could not
 * tell a real cancellation apart from simply ignoring a late response.
 */
describe('Race condition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    resetCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const successNames = (states: SearchState[]): string[] =>
    states.flatMap((s) => (s.status === 'success' ? s.countries.map((c) => c.name) : []));

  it('does not render the stale result when the older request resolves LATER than the newer one', async () => {
    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    const abortedQueries: string[] = [];

    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init: RequestInit) => {
      const query = url.split('/').pop()!;
      // Resolution order is inverted: the earlier query ('sp') is slower.
      const delay = query === 'sp' ? 1000 : 100;

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: async () => [{ name: query, population: 1 }],
          });
        }, delay);

        init.signal?.addEventListener('abort', () => {
          abortedQueries.push(query);
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    // t=0 — type 'sp', request goes out after the debounce window
    controller.updateQuery('sp');
    await vi.advanceTimersByTimeAsync(300); // fetch('sp') in flight, resolves at t=1300
    expect(fetch).toHaveBeenCalledTimes(1);

    // t=300 — type 'spain', request goes out after the next debounce window
    controller.updateQuery('spain');
    await vi.advanceTimersByTimeAsync(300); // fetch('spain') in flight, resolves at t=700
    expect(fetch).toHaveBeenCalledTimes(2);

    // t=700 — 'spain' resolves first
    await vi.advanceTimersByTimeAsync(100);
    const afterFresh = states[states.length - 1];
    expect(afterFresh.status).toBe('success');
    if (afterFresh.status === 'success') {
      expect(afterFresh.countries[0].name).toBe('spain');
    }

    // t=1300 — this is when 'sp' would have resolved. It must NOT overwrite
    // the fresh result that is already on screen.
    await vi.advanceTimersByTimeAsync(600);

    expect(states[states.length - 1].status).toBe('success');
    expect(successNames(states)).toEqual(['spain']);

    // The older request was really cancelled, not filtered out post factum.
    expect(abortedQueries).toContain('sp');
  });

  it('does not render the stale result that arrives during the debounce window', async () => {
    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    const abortedQueries: string[] = [];

    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init: RequestInit) => {
      const query = url.split('/').pop()!;

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: async () => [{ name: query, population: 1 }],
          });
        }, 100);

        init.signal?.addEventListener('abort', () => {
          abortedQueries.push(query);
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    // t=0 — type 'sp'
    controller.updateQuery('sp');
    // t=300 — debounce fires, fetch('sp') goes out and will resolve at t=400
    await vi.advanceTimersByTimeAsync(300);
    expect(fetch).toHaveBeenCalledTimes(1);

    // t=350 — the user keeps typing while 'sp' is still in flight.
    // 'sp' would resolve at t=400, i.e. INSIDE the debounce window of 'spain'.
    await vi.advanceTimersByTimeAsync(50);
    controller.updateQuery('spain');

    // t=400 — the moment the stale response would have been rendered
    await vi.advanceTimersByTimeAsync(50);
    expect(successNames(states)).not.toContain('sp');

    // t=650 — debounce fires for 'spain', t=750 — it resolves
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(100);

    const finalState = states[states.length - 1];
    expect(finalState.status).toBe('success');
    if (finalState.status === 'success') {
      expect(finalState.countries[0].name).toBe('spain');
    }

    // The stale request was cancelled at the moment of the new input,
    // long before its own debounce window had to start a new search.
    expect(abortedQueries).toContain('sp');
  });

  it('sends a single request for rapid typing and renders only the last query', async () => {
    const states: SearchState[] = [];
    const controller = new SearchController((s) => states.push(s));

    const queriesSeen: string[] = [];

    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init: RequestInit) => {
      const query = url.split('/').pop()!;
      queriesSeen.push(query);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: async () => [{ name: query, population: 1 }],
          });
        }, 100);

        init.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    // Type letter by letter, every 50ms — faster than the 300ms debounce
    const fullQuery = 'spain';
    for (let i = 1; i <= fullQuery.length; i++) {
      controller.updateQuery(fullQuery.slice(0, i));
      await vi.advanceTimersByTimeAsync(50);
    }

    // Let the last debounce fire and its request resolve
    await vi.advanceTimersByTimeAsync(500);

    expect(queriesSeen).toEqual([fullQuery]);
    expect(successNames(states)).toEqual([fullQuery]);
  });
});
