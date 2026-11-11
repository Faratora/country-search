import { SearchController, type SearchState } from './searchController.js';
import type { CountryCard } from './api/mapCountryResponse.js';

const STATUS_TEXT = {
  loading: 'Loading…',
  empty: 'Nothing found. Try another query.',
};

/**
 * Builds and mounts the whole UI into `root`.
 * Dynamic content is created exclusively with createElement/textContent —
 * no innerHTML anywhere, so API data can never be interpreted as markup.
 */
export function mountUi(root: HTMLElement): void {
  const app = el('main', 'app');

  const title = el('h1', 'app__title');
  title.textContent = 'Country Search';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'search__input';
  input.placeholder = 'Search countries…';
  input.setAttribute('aria-label', 'Search countries');
  input.autocomplete = 'off';

  const search = el('div', 'search');
  search.append(input);

  const statusEl = el('div', 'status');
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');

  const listEl = el('ul', 'results');
  listEl.setAttribute('aria-label', 'Search results');

  const detailEl = el('section', 'detail');
  detailEl.hidden = true;

  app.append(title, search, statusEl, listEl, detailEl);
  root.append(app);

  const controller = new SearchController((state) => render(state));

  input.addEventListener('input', () => {
    controller.updateQuery(input.value);
  });

  function render(state: SearchState): void {
    listEl.replaceChildren();
    statusEl.replaceChildren();
    statusEl.className = 'status';
    detailEl.replaceChildren();
    detailEl.hidden = true;
    listEl.hidden = false;

    switch (state.status) {
      case 'idle':
        app.dataset.status = 'idle';
        return;

      case 'loading': {
        app.dataset.status = 'loading';
        const spinner = el('span', 'status__spinner');
        spinner.setAttribute('aria-hidden', 'true');
        spinner.textContent = '◌';
        statusEl.append(spinner, document.createTextNode(STATUS_TEXT.loading));
        return;
      }

      case 'empty':
        app.dataset.status = 'empty';
        statusEl.className = 'status status--hint';
        statusEl.textContent = STATUS_TEXT.empty;
        return;

      case 'error': {
        app.dataset.status = 'error';
        statusEl.className = 'status status--error';
        const msg = el('span', 'status__message');
        msg.textContent = state.message;

        const retryBtn = el('button', 'status__retry');
        retryBtn.type = 'button';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', () => controller.retry());

        statusEl.append(msg, retryBtn);
        return;
      }

      case 'success': {
        app.dataset.status = 'success';
        state.countries.forEach((country) => {
          listEl.append(buildCard(country, () => showDetail(country, state.countries)));
        });
        return;
      }
    }
  }

  function showDetail(country: CountryCard, all: CountryCard[]): void {
    listEl.hidden = true;
    statusEl.replaceChildren();
    detailEl.replaceChildren();
    detailEl.hidden = false;

    const backBtn = el('button', 'detail__back');
    backBtn.type = 'button';
    backBtn.textContent = '← Back to results';
    backBtn.addEventListener('click', () => {
      detailEl.hidden = true;
      listEl.hidden = false;
      render(controller.getState());
    });

    const heading = el('h2', 'detail__title');
    const flag = el('span', 'detail__flag');
    flag.textContent = country.flag;
    flag.setAttribute('aria-hidden', 'true');
    heading.append(flag, document.createTextNode(country.name));

    const grid = el('dl', 'detail__grid');
    const rows: Array<[string, string]> = [
      ['Capital', country.capital || 'N/A'],
      ['Region', country.region || 'N/A'],
      ['Population', country.population ? country.population.toLocaleString('en-US') : 'N/A'],
      ['Area', country.area ? `${country.area.toLocaleString('en-US')} km²` : 'N/A'],
      ['Languages', country.languages.length ? country.languages.join(', ') : 'N/A'],
      ['Currencies', country.currencies?.length ? country.currencies.join(', ') : 'N/A'],
      ['Borders', country.borders?.length ? country.borders.join(', ') : 'N/A'],
      ['Description', country.description || 'No description available.'],
    ];

    rows.forEach(([label, value]) => {
      const dt = el('dt', 'detail__label');
      dt.textContent = label;
      const dd = el('dd', 'detail__value');
      dd.textContent = value;
      grid.append(dt, dd);
    });

    detailEl.append(backBtn, heading, grid);

    // Allow stepping between the results without going back first.
    if (all.length > 1) {
      const nav = el('nav', 'detail__nav');
      const index = all.indexOf(country);

      const prev = el('button', 'detail__nav-btn');
      prev.type = 'button';
      prev.textContent = 'Previous';
      prev.disabled = index <= 0;
      prev.addEventListener('click', () => showDetail(all[index - 1], all));

      const next = el('button', 'detail__nav-btn');
      next.type = 'button';
      next.textContent = 'Next';
      next.disabled = index >= all.length - 1;
      next.addEventListener('click', () => showDetail(all[index + 1], all));

      nav.append(prev, next);
      detailEl.append(nav);
    }
  }
}

function buildCard(country: CountryCard, onOpen: () => void): HTMLElement {
  const li = el('li', 'card');
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', `${country.name}, ${country.capital}`);

  const flag = el('span', 'card__flag');
  flag.textContent = country.flag;
  flag.setAttribute('aria-hidden', 'true');

  const body = el('div', 'card__body');

  const name = el('span', 'card__name');
  name.textContent = country.name;

  const meta = el('span', 'card__meta');
  meta.textContent = [country.capital, country.region].filter(Boolean).join(' · ');

  const population = el('span', 'card__population');
  population.textContent = country.population
    ? `${country.population.toLocaleString('en-US')} people`
    : 'Population unknown';

  body.append(name, meta, population);
  li.append(flag, body);

  li.addEventListener('click', onOpen);
  li.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  });

  return li;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}
