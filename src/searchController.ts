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
      this.lastQuery = query;
      this.setState({
        status: 'success',
        countries: cached.map((item) => mapCountryResponse(item as Record<string, unknown>)),
      });
      addToHistory(query);
      return;
    }

    this.lastQuery = query;
    this.setState({ status: 'loading' });
    this.debouncedSearch.fn(query);
  }

  retry(): void {
    if (this.lastQuery) {
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

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combinedSignal =
      typeof AbortSignal.any === 'function'
        ? AbortSignal.any([controller.signal, timeoutSignal])
        : controller.signal;

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
