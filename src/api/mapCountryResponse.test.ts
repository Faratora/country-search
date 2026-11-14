import { describe, it, expect } from 'vitest';
import { mapCountryResponse, type CountryCard } from './mapCountryResponse';

const rawCountry = {
  name: 'Spain',
  flag: '🇪🇸',
  flags: {
    png: 'https://flagcdn.com/w320/es.png',
    svg: 'https://flagcdn.com/es.svg',
  },
  capital: 'Madrid',
  region: 'Europe',
  population: 47351567,
  languages: [{ name: 'Spanish' }, { name: 'Catalan' }],
  area: 505992,
  borders: ['AND', 'FRA', 'GIB', 'PRT', 'MAR'],
  currencies: [{ name: 'Euro', code: 'EUR' }],
  description: 'A beautiful Mediterranean country',
};

const minimalRaw = {
  name: 'Andorra',
};

describe('mapCountryResponse', () => {
  it('maps all fields from a full response', () => {
    const result: CountryCard = mapCountryResponse(rawCountry);

    expect(result.name).toBe('Spain');
    expect(result.flag).toBe('🇪🇸');
    expect(result.capital).toBe('Madrid');
    expect(result.region).toBe('Europe');
    expect(result.population).toBe(47351567);
    expect(result.languages).toEqual(['Spanish', 'Catalan']);
    expect(result.area).toBe(505992);
    expect(result.borders).toEqual(['AND', 'FRA', 'GIB', 'PRT', 'MAR']);
    expect(result.currencies).toEqual(['Euro']);
    expect(result.description).toBe('A beautiful Mediterranean country');
  });

  it('uses defaults for missing fields', () => {
    const result: CountryCard = mapCountryResponse(minimalRaw);

    expect(result.name).toBe('Andorra');
    expect(result.flag).toBe('');
    expect(result.capital).toBe('');
    expect(result.region).toBe('');
    expect(result.population).toBe(0);
    expect(result.languages).toEqual([]);
    expect(result.currencies).toEqual([]);
  });

  it('omits undefined optional fields', () => {
    const result: CountryCard = mapCountryResponse(minimalRaw);

    expect(result.area).toBeUndefined();
    expect(result.borders).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it('handles languages as a flat string array', () => {
    const flatLanguages = {
      name: 'Test',
      languages: ['English', 'French'],
    };
    const result = mapCountryResponse(flatLanguages);
    expect(result.languages).toEqual(['English', 'French']);
  });

  it('handles currencies as a flat string array', () => {
    const flatCurrencies = {
      name: 'Test',
      currencies: ['USD', 'EUR'],
    };
    const result = mapCountryResponse(flatCurrencies);
    expect(result.currencies).toEqual(['USD', 'EUR']);
  });

  it('handles currencies with objects containing a "name" property', () => {
    const currenciesWithNames = {
      name: 'Test',
      currencies: [{ name: 'Dollar' }, { name: 'Euro' }],
    };
    const result = mapCountryResponse(currenciesWithNames);
    expect(result.currencies).toEqual(['Dollar', 'Euro']);
  });

  it('handles currencies with plain strings', () => {
    const result = mapCountryResponse({
      name: 'Test',
      currencies: ['Dollar', 'Euro'],
    });
    expect(result.currencies).toEqual(['Dollar', 'Euro']);
  });

  it('returns empty name when name is null', () => {
    const result = mapCountryResponse({ name: null });
    expect(result.name).toBe('');
  });

  it('returns empty population when population is null', () => {
    const result = mapCountryResponse({ name: 'Test', population: null });
    expect(result.population).toBe(0);
  });

  it('prefers flags.svg for the flag image URL', () => {
    const result = mapCountryResponse(rawCountry);
    expect(result.flagUrl).toBe('https://flagcdn.com/es.svg');
  });

  it('falls back to flags.png when svg is missing', () => {
    const result = mapCountryResponse({
      name: 'Test',
      flags: { png: 'https://flagcdn.com/w320/de.png' },
    });
    expect(result.flagUrl).toBe('https://flagcdn.com/w320/de.png');
  });

  it('returns empty flagUrl when the flags object is absent', () => {
    const result = mapCountryResponse({ name: 'Test', flag: '🇹🇹' });
    expect(result.flagUrl).toBe('');
  });

  it('returns empty flagUrl when flags values are not http(s) URLs', () => {
    const result = mapCountryResponse({
      name: 'Test',
      flags: { svg: 'javascript:alert(1)', png: 'data:text/html,<script>' },
    });
    expect(result.flagUrl).toBe('');
  });

  it('returns empty flagUrl when flags is not an object', () => {
    const result = mapCountryResponse({ name: 'Test', flags: 'https://evil.example/x.svg' });
    expect(result.flagUrl).toBe('');
  });
});
