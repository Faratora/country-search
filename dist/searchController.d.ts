import { type CountryCard } from './api/mapCountryResponse.js';
export type SearchState =
  | {
      status: 'idle';
    }
  | {
      status: 'loading';
    }
  | {
      status: 'success';
      countries: CountryCard[];
    }
  | {
      status: 'empty';
    }
  | {
      status: 'error';
      message: string;
      query: string;
    };
export declare class SearchController {
  private controller;
  private lastQuery;
  private state;
  private readonly onStateChange;
  private readonly debouncedSearch;
  constructor(onStateChange: (state: SearchState) => void);
  getState(): SearchState;
  updateQuery(query: string): void;
  retry(): void;
  private executeSearch;
  private setState;
}
