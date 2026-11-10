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

export function mapCountryResponse(raw: Record<string, unknown>): CountryCard {
  return {
    name: (raw.name as string) ?? '',
    flag: (raw.flag as string) ?? '',
    capital: (raw.capital as string) ?? '',
    region: (raw.region as string) ?? '',
    population: (raw.population as number) ?? 0,
    languages: Array.isArray(raw.languages)
      ? raw.languages.map((l: unknown) => {
          if (l !== null && typeof l === 'object' && 'name' in l) {
            return (l as { name: string }).name;
          }
          return String(l);
        })
      : [],
    area: raw.area as number | undefined,
    borders: raw.borders as string[] | undefined,
    currencies: Array.isArray(raw.currencies)
      ? raw.currencies.map((c: unknown) => {
          if (c !== null && typeof c === 'object' && 'name' in c) {
            return (c as { name: string }).name;
          }
          return String(c);
        })
      : [],
    description: raw.description as string | undefined,
  };
}
