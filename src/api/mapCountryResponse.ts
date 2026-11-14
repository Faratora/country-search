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

/** Extracts a usable flag image URL from the API's nested `flags` object. */
function extractFlagUrl(raw: Record<string, unknown>): string {
  const flags = raw.flags;
  if (flags === null || typeof flags !== 'object') return '';
  const { svg, png } = flags as { svg?: unknown; png?: unknown };
  for (const candidate of [svg, png]) {
    // Only http(s) URLs are accepted — never pass arbitrary strings to <img src>.
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }
  return '';
}

export function mapCountryResponse(raw: Record<string, unknown>): CountryCard {
  return {
    name: (raw.name as string) ?? '',
    flag: (raw.flag as string) ?? '',
    flagUrl: extractFlagUrl(raw),
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
