export interface CountryCard {
    name: string;
    flag: string;
    /** Image URL from `flags.svg`/`flags.png`. Preferred over the emoji,
     *  which Windows cannot render (no regional-indicator font). */
    flagUrl: string;
    capital: string;
    region: string;
    population: number;
    languages: string[];
    area?: number;
    borders?: string[];
    currencies?: string[];
    description?: string;
}
export declare function mapCountryResponse(raw: Record<string, unknown>): CountryCard;
