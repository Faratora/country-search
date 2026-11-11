export interface CountryCard {
  name: string;
  flag: string;
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
