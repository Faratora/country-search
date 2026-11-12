/**
 * In-memory cache with TTL, deduplication and localStorage history.
 */
export interface CachedResult {
  countries: unknown[];
  timestamp: number;
}
export type HistoryEntry = {
  query: string;
  timestamp: number;
};
export declare function getCached(query: string): unknown[] | null;
export declare function setCached(query: string, countries: unknown[]): void;
export declare function clearExpired(): void;
export declare function getCachedOrInflight(query: string): Promise<unknown[]> | null;
export declare function setInflight(query: string, promise: Promise<unknown[]>): void;
export declare function clearInflight(query: string): void;
export declare function addToHistory(query: string): void;
export declare function getHistory(): HistoryEntry[];
export declare function clearHistory(): void;
export declare function resetCache(): void;
