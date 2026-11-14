import { HttpError } from './HttpError.js';
const BASE_URL = 'https://countries.dev/name';
export async function searchCountries(query, signal) {
    const response = await fetch(`${BASE_URL}/${encodeURIComponent(query)}`, {
        signal,
    });
    if (response.status === 404) {
        return [];
    }
    if (!response.ok) {
        throw new HttpError(response.status);
    }
    return response.json();
}
