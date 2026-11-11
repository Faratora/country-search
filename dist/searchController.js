import { debounce } from './utils/debounce.js';
import { searchCountries } from './api/searchCountries.js';
import { HttpError } from './api/HttpError.js';
import { mapCountryResponse } from './api/mapCountryResponse.js';
const DEBOUNCE_DELAY_MS = 300;
const REQUEST_TIMEOUT_MS = 8000;
export class SearchController {
    constructor(onStateChange) {
        this.controller = null;
        this.lastQuery = '';
        this.state = { status: 'idle' };
        this.onStateChange = onStateChange;
        this.debouncedSearch = debounce((q) => {
            void this.executeSearch(q);
        }, DEBOUNCE_DELAY_MS);
        this.setState({ status: 'idle' });
    }
    getState() {
        return this.state;
    }
    updateQuery(query) {
        // Cancel the in-flight request IMMEDIATELY on every input change,
        // not only when debounce actually fires — otherwise a stale response
        // can arrive during the debounce window and overwrite fresh results.
        this.controller?.abort();
        this.controller = null;
        if (query.trim() === '') {
            this.lastQuery = '';
            this.setState({ status: 'idle' });
            return;
        }
        this.lastQuery = query;
        this.setState({ status: 'loading' });
        this.debouncedSearch(query);
    }
    retry() {
        if (this.lastQuery) {
            void this.executeSearch(this.lastQuery);
        }
    }
    async executeSearch(query) {
        // If a request is still in flight (e.g. debounce fired while one was
        // running) — cancel it before starting a new one.
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        const combinedSignal = typeof AbortSignal.any === 'function'
            ? AbortSignal.any([controller.signal, timeoutSignal])
            : controller.signal;
        try {
            const raw = await searchCountries(query, combinedSignal);
            const countries = raw.map((item) => mapCountryResponse(item));
            if (countries.length === 0) {
                this.setState({ status: 'empty' });
            }
            else {
                this.setState({ status: 'success', countries });
            }
        }
        catch (err) {
            // Our own cancellation — must NOT be shown as an error.
            if (err instanceof DOMException && err.name === 'AbortError') {
                return;
            }
            // Real timeout — distinct from user cancellation.
            if (err instanceof DOMException && err.name === 'TimeoutError') {
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
        }
        finally {
            if (this.controller === controller) {
                this.controller = null;
            }
        }
    }
    setState(state) {
        this.state = state;
        this.onStateChange(state);
    }
}
