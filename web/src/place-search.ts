// The "Find a place" box: type a city, town or country and fly the globe there.
// It is separate from the JID form and doesn't add or change any pins.
import { searchCities } from './api';
import { countryFor, searchCountries } from './countries';
import { byId, el } from './dom';

/** Somewhere the globe can fly to. */
interface Place {
  name: string;
  detail: string; // shown in grey next to the name
  lat: number;
  lng: number;
  altitude: number; // how close to fly in
}

const COUNTRY_ALTITUDE = 1.2;
const CITY_ALTITUDE = 0.25;
const MIN_LETTERS = 2;

export function setupPlaceSearch(onChoose: (place: Place) => void): void {
  const input = byId<HTMLInputElement>('place');
  const list = byId('place-list');
  let timer: number | undefined;
  let searchNumber = 0; // lets us ignore replies to out-of-date searches
  let results: Place[] = [];

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < MIN_LETTERS) return hide();
    timer = window.setTimeout(() => search(query), 150);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && results.length > 0) choose(results[0]);
    if (event.key === 'Escape') hide();
  });

  // Close the list when focus leaves the box and its suggestions.
  input.parentElement!.addEventListener('focusout', (event) => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (!next || !input.parentElement!.contains(next)) hide();
  });

  async function search(query: string): Promise<void> {
    const thisSearch = ++searchNumber;

    // Countries come from the list bundled in the app; towns come from the server.
    const countries: Place[] = searchCountries(query, 3).map((country) => ({
      name: country.name,
      detail: 'Country',
      lat: country.lat,
      lng: country.lng,
      altitude: COUNTRY_ALTITUDE,
    }));

    let cities: Place[] = [];
    try {
      cities = (await searchCities(null, query)).map((city) => ({
        name: city.name,
        detail: countryFor(city.country_code)?.name ?? city.country_code,
        lat: city.lat,
        lng: city.lng,
        altitude: CITY_ALTITUDE,
      }));
    } catch {
      // If the server can't be reached, countries alone are still useful.
    }

    if (thisSearch !== searchNumber) return;
    show([...countries, ...cities]);
  }

  function show(places: Place[]): void {
    results = places;
    if (places.length === 0) {
      list.replaceChildren(el('li', 'none', 'Nothing found. Check the spelling, or try a bigger town nearby.'));
    } else {
      list.replaceChildren(
        ...places.map((place) => {
          const button = el('button');
          button.type = 'button';
          button.append(el('span', '', place.name), el('small', '', place.detail));
          button.addEventListener('click', () => choose(place));
          const item = el('li');
          item.append(button);
          return item;
        }),
      );
    }
    list.hidden = false;
  }

  function choose(place: Place): void {
    input.value = place.name;
    hide();
    input.blur(); // puts the phone keyboard away so the globe is visible
    onChoose(place);
  }

  function hide(): void {
    searchNumber++;
    window.clearTimeout(timer);
    results = [];
    list.hidden = true;
    list.replaceChildren();
  }
}
