/**
 * In-memory cache with TTL, deduplication and localStorage history.
 */
const CACHE_KEY = 'country-search-cache';
const HISTORY_KEY = 'country-search-history';
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_HISTORY_ITEMS = 10;
/* ── Cache ─────────────────────────────────────────────────────── */
function loadCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw)
            return new Map();
        const items = JSON.parse(raw);
        const now = Date.now();
        const map = new Map();
        for (const [key, entry] of Object.entries(items)) {
            if (now - entry.timestamp < CACHE_TTL_MS) {
                map.set(key, entry);
            }
        }
        return map;
    }
    catch {
        return new Map();
    }
}
function saveCache(map) {
    try {
        const obj = {};
        let count = 0;
        for (const [key, value] of map) {
            if (count >= MAX_CACHE_SIZE)
                break;
            obj[key] = value;
            count++;
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    }
    catch {
        // Storage full or unavailable — silently ignore
    }
}
const cache = loadCache();
export function getCached(query) {
    const entry = cache.get(query);
    if (!entry)
        return null;
    return entry.countries;
}
export function setCached(query, countries) {
    cache.set(query, { countries, timestamp: Date.now() });
    saveCache(cache);
}
export function clearExpired() {
    const now = Date.now();
    let changed = false;
    for (const [key, entry] of cache) {
        if (now - entry.timestamp >= CACHE_TTL_MS) {
            cache.delete(key);
            changed = true;
        }
    }
    if (changed)
        saveCache(cache);
}
/* ── Deduplication ─────────────────────────────────────────────── */
const inflight = new Map();
export function getCachedOrInflight(query) {
    return inflight.get(query) ?? null;
}
export function setInflight(query, promise) {
    inflight.set(query, promise);
}
export function clearInflight(query) {
    inflight.delete(query);
}
/* ── History ───────────────────────────────────────────────────── */
function loadHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw)
            return [];
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
function saveHistoryList(entries) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    }
    catch {
        // Storage full or unavailable — silently ignore
    }
}
export function addToHistory(query) {
    if (!query.trim())
        return;
    const entries = loadHistory();
    const now = Date.now();
    // Remove duplicate if already exists
    const filtered = entries.filter((e) => e.query.toLowerCase() !== query.toLowerCase());
    // Prepend the new query
    filtered.unshift({ query: query.trim(), timestamp: now });
    // Trim to max size
    const trimmed = filtered.slice(0, MAX_HISTORY_ITEMS);
    saveHistoryList(trimmed);
}
export function getHistory() {
    return loadHistory();
}
export function clearHistory() {
    try {
        localStorage.removeItem(HISTORY_KEY);
    }
    catch {
        // ignore
    }
}
export function resetCache() {
    cache.clear();
    try {
        localStorage.removeItem(CACHE_KEY);
    }
    catch {
        // ignore
    }
    inflight.clear();
}
