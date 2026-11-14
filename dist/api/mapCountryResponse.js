/** Extracts a usable flag image URL from the API's nested `flags` object. */
function extractFlagUrl(raw) {
    const flags = raw.flags;
    if (flags === null || typeof flags !== 'object')
        return '';
    const { svg, png } = flags;
    for (const candidate of [svg, png]) {
        // Only http(s) URLs are accepted — never pass arbitrary strings to <img src>.
        if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
            return candidate;
        }
    }
    return '';
}
export function mapCountryResponse(raw) {
    return {
        name: raw.name ?? '',
        flag: raw.flag ?? '',
        flagUrl: extractFlagUrl(raw),
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
