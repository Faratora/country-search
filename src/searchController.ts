import { debounce } from './utils/debounce.js';
import { searchCountries } from './api/searchCountries.js';
import { HttpError } from './api/HttpError.js';
import { mapCountryResponse, type CountryCard } from './api/mapCountryResponse.js';
import {
  getCached,
  setCached,
  getCachedOrInflight,
  setInflight,
  clearInflight,
  addToHistory,
} from './utils/cache.js';

const DEBOUNCE_DELAY_MS = 300;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Combines the user-cancellation signal with a timeout source.
 *
 * Modern engines delegate to AbortSignal.any + AbortSignal.timeout.
 * When AbortSignal.any is unavailable we compose both sources MANUALLY
 * into a dedicated controller — the timeout keeps working via a plain
 * setTimeout that aborts with a TimeoutError DOMException, exactly like
 * AbortSignal.timeout would. `dispose()` detaches listeners and clears
 * the timer so finished requests leave no residue.
 */
function combineSignalsWithTimeout(
  cancelSignal: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  if (typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function') {
    return {
      signal: AbortSignal.any([cancelSignal, AbortSignal.timeout(timeoutMs)]),
      dispose: () => {},
    };
  }

  const combined = new AbortController();
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    cancelSignal.removeEventListener('abort', onUserAbort);
  };

  const timer = setTimeout(() => {
    if (!combined.signal.aborted) {
      combined.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    }
    dispose();
  }, timeoutMs);

  const onUserAbort = (): void => {
    if (!combined.signal.aborted) {
      combined.abort(cancelSignal.reason);
    }
    dispose();
  };

  if (cancelSignal.aborted) {
    onUserAbort();
  } else {
    cancelSignal.addEventListener('abort', onUserAbort, { once: true });
  }

  return { signal: combined.signal, dispose };
}

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; countries: CountryCard[] }
  | { status: 'empty' }
  | { status: 'error'; message: string; query: string };

export class SearchController {
  private controller: AbortController | null = null;
  private lastQuery = '';
  private state: SearchState = { status: 'idle' };
  private readonly onStateChange: (state: SearchState) => void;
  private readonly debouncedSearch: { fn: (q: string) => void; cancel: () => void };

  constructor(onStateChange: (state: SearchState) => void) {
    this.onStateChange = onStateChange;
    this.debouncedSearch = debounce((q: string) => {
      void this.executeSearch(q);
    }, DEBOUNCE_DELAY_MS);
    this.setState({ status: 'idle' });
  }

  getState(): SearchState {
    return this.state;
  }

  updateQuery(query: string): void {
    // Cancel the in-flight request IMMEDIATELY on every input change,
    // not only when debounce actually fires — otherwise a stale response
    // can arrive during the debounce window and overwrite fresh results.
    this.controller?.abort();
    this.controller = null;

    if (query.trim() === '') {
      this.debouncedSearch.cancel();
      this.lastQuery = '';
      this.setState({ status: 'idle' });
      return;
    }

    // Check cache first
    const cached = getCached(query);
    if (cached) {
      const countries = cached.map((item) => mapCountryResponse(item as Record<string, unknown>));
      this.lastQuery = query;
      this.setState(
        countries.length === 0 ? { status: 'empty' } : { status: 'success', countries },
      );
      addToHistory(query);
      return;
    }

    this.lastQuery = query;
    this.setState({ status: 'loading' });
    this.debouncedSearch.fn(query);
  }

  retry(): void {
    if (this.lastQuery) {
      // Drop a stale in-flight request from the previous attempt so its
      // response can never race with the retried one.
      this.controller?.abort();
      this.controller = null;

      this.setState({ status: 'loading' });
      void this.executeSearch(this.lastQuery);
    }
  }

  private async executeSearch(query: string): Promise<void> {
    // Deduplication: if an identical request is already in flight, reuse it.
    const inflight = getCachedOrInflight(query);
    if (inflight) {
      try {
        const raw = await inflight;
        const countries = raw.map((item) => mapCountryResponse(item as Record<string, unknown>));
        if (this.lastQuery === query) {
          if (countries.length === 0) {
            this.setState({ status: 'empty' });
          } else {
            this.setState({ status: 'success', countries });
          }
        }
        addToHistory(query);
        return;
      } catch {
        // If the in-flight promise failed, fall through to a fresh request
      }
    }

    // If a request is still in flight (e.g. debounce fired while one was
    // running) — cancel it before starting a new one.
    this.controller?.abort();

    const controller = new AbortController();
    this.controller = controller;

    const { signal: combinedSignal, dispose } = combineSignalsWithTimeout(
      controller.signal,
      REQUEST_TIMEOUT_MS,
    );

    // Wrap the actual fetch in a promise we can deduplicate on
    const fetchPromise = searchCountries(query, combinedSignal);
    setInflight(query, fetchPromise);

    try {
      const raw = await fetchPromise;
      const countries = raw.map((item) => mapCountryResponse(item as Record<string, unknown>));

      // Cache the raw result
      setCached(query, raw);
      addToHistory(query);

      if (this.lastQuery !== query) return;

      if (countries.length === 0) {
        this.setState({ status: 'empty' });
      } else {
        this.setState({ status: 'success', countries });
      }
    } catch (err) {
      const errName = (err instanceof DOMException && err.name) || '';

      // Our own cancellation — must NOT be shown as an error.
      if (errName === 'AbortError') {
        return;
      }

      // Real timeout — distinct from user cancellation.
      if (errName === 'TimeoutError') {
        this.setState({
          status: 'error',
          message: 'Request timed out. Please try again.',
          query,
        });
        return;
      }

      // HttpError (500 and other non-404 statuses).
      if (err instanceof HttpError) {
        this.setState({
          status: 'error',
          message: `Server error (${err.status}). Please try again.`,
          query,
        });
        return;
      }

      // Any other network failure.
      this.setState({
        status: 'error',
        message: 'Network error. Please check your connection.',
        query,
      });
    } finally {
      dispose();
      clearInflight(query);
      if (this.controller === controller) {
        this.controller = null;
      }
    }
  }

  private setState(state: SearchState): void {
    this.state = state;
    this.onStateChange(state);
  }
}
