export function mapCountryResponse(raw) {
    return {
        name: raw.name ?? '',
        flag: raw.flag ?? '',
        capital: raw.capital ?? '',
        region: raw.region ?? '',
        population: raw.population ?? 0,
        languages: Array.isArray(raw.languages)
            ? raw.languages.map((l) => {
                if (l !== null && typeof l === 'object' && 'name' in l) {
                    return l.name;
                }
                return String(l);
            })
            : [],
        area: raw.area,
        borders: raw.borders,
        currencies: Array.isArray(raw.currencies)
            ? raw.currencies.map((c) => {
                if (c !== null && typeof c === 'object' && 'name' in c) {
                    return c.name;
                }
                return String(c);
            })
            : [],
        description: raw.description,
    };
}
