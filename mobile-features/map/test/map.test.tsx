import { OSM_ATTRIBUTION, testIDs } from '@iraq-maps/contracts';
import { t } from '@iraq-maps/i18n';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { MapScreen } from '../src';
import { citadel, city, fakeApi, later, mapProps, respond, show, street } from './render';

const { map } = testIDs;
const screen = <MapScreen />;
const wait = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

/** Shows the map, types `text` and lets the 300ms debounce run out. */
async function search(text: string, api = fakeApi(), locale?: 'en') {
  const shown = await show(screen, { api, locale });
  await fireEvent.changeText(await shown.view.findByTestId(map.searchInput), text);
  await wait(300);
  return shown;
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('map', () => {
  it('shows the city from GET /v1/cities with the OSM attribution, labels in the app language', async () => {
    const { view } = await show(screen);
    expect(await view.findByTestId(map.view)).toBeVisible();
    expect(view.getByTestId(map.attribution)).toHaveTextContent(OSM_ATTRIBUTION);
    expect(view.getByTestId(map.attribution)).toBeVisible();
    expect(mapProps()).toMatchObject({ city, apiBaseUrl: 'http://api.test', lang: 'ar', camera: { bounds: city.bbox }, markers: [], showUserLocation: false });
  });

  it('offers a retry when the city list cannot be reached', async () => {
    const api = fakeApi();
    api.cities.list.mockRejectedValueOnce(new TypeError('Network request failed'));
    const { view } = await show(screen, { api });
    expect(await view.findByText(t('common:errors.network'))).toBeVisible();
    expect(view.queryByTestId(map.view)).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: t('common:actions.retry') }));
    expect(await view.findByTestId(map.view)).toBeVisible();
  });

  it('switches the map label language from the sheet', async () => {
    const { view } = await show(screen);
    await fireEvent.press(await view.findByTestId(map.lang));
    expect(view.getByRole('radio', { name: 'العربية' })).toBeChecked();
    await fireEvent.press(view.getByTestId(`${map.lang}.ckb`));
    expect(mapProps().lang).toBe('ckb');
  });
});

describe('search', () => {
  it('waits until typing pauses for 300ms, then searches once near the city centre in the map language', async () => {
    const { api, view } = await show(screen);
    const input = await view.findByTestId(map.searchInput);
    for (const text of ['ق', 'قل', 'قلعه']) {
      await fireEvent.changeText(input, text);
      await wait(200);
    }
    expect(api.places.search).not.toHaveBeenCalled();
    await wait(100);
    expect(api.places.search).toHaveBeenCalledTimes(1);
    expect(api.places.search.mock.calls[0]?.[0]?.query).toEqual({ q: 'قلعه', city: 'baghdad', near: '44.366100,33.315200', lang: 'ar' });
  });

  it('aborts the request in flight when the query changes, and ignores its late answer', async () => {
    const api = fakeApi();
    const [first, second] = [later(), later()];
    api.places.search.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { view } = await search('قلعه', api);
    await fireEvent.changeText(view.getByTestId(map.searchInput), 'شارع');
    await wait(300);
    const [a, b] = api.places.search.mock.calls.map(([req]) => req?.fetchOptions?.signal);
    expect(a?.aborted).toBe(true);
    expect(b?.aborted).toBe(false);
    await act(async () => {
      second.settle({ status: 200, body: { items: [street] } });
      first.settle({ status: 200, body: { items: [citadel] } });
    });
    expect(view.getAllByTestId(map.searchResult)).toHaveLength(1);
    expect(view.getByText('شارع القلعة')).toBeOnTheScreen();
    expect(view.queryByText('قلعة بغداد')).toBeNull();
  });

  it('shows the loading state, then results with kind, area, source and Arabic-Indic distances', async () => {
    const api = fakeApi();
    const pending = later();
    api.places.search.mockReturnValueOnce(pending.promise);
    const { view, router } = await search('قلعه', api);
    expect(view.getByText(t('common:status.loading'))).toBeVisible();
    await act(async () => pending.settle({ status: 200, body: { items: [citadel, street] } }));
    expect(view.queryByText(t('common:status.loading'))).toBeNull();
    const [first, second] = view.getAllByTestId(map.searchResult);
    expect(first).toHaveAccessibleName(`قلعة بغداد ١٫٢ كم سياحة · الرصافة ${t('map:source.osm')}`);
    expect(second).toHaveAccessibleName(`شارع القلعة ٣٥٠ م شارع ${t('map:source.osm')}`);
    expect(mapProps().markers).toEqual([
      { id: 'n1001', location: citadel.location },
      { id: 'w2002', location: street.location },
    ]);
    await fireEvent.press(first!);
    expect(router.push).toHaveBeenCalledWith('/place/n1001');
  });

  it('names results in the chosen map language, with Latin digits in English', async () => {
    const api = fakeApi();
    api.places.search.mockReturnValue(respond(200, { items: [citadel] }));
    const { view } = await search('citadel', api, 'en');
    expect(api.places.search.mock.calls[0]?.[0]?.query).toMatchObject({ lang: 'en' });
    expect(view.getByTestId(map.searchResult)).toHaveAccessibleName('Baghdad Citadel 1.2 km Tourism · Rusafa From OpenStreetMap');
  });

  it('says so when nothing matches', async () => {
    const api = fakeApi();
    api.places.search.mockReturnValue(respond(200, { items: [] }));
    const { view } = await search('zzz', api);
    expect(view.getByText(t('map:search.empty', { query: '\u2068zzz\u2069' }))).toBeVisible();
    expect(view.queryByTestId(map.searchResult)).toBeNull();
  });

  it('shows the offline message with a retry that searches again', async () => {
    const api = fakeApi();
    api.places.search.mockRejectedValueOnce(new TypeError('Network request failed')).mockReturnValueOnce(respond(200, { items: [citadel] }));
    const { view } = await search('قلعه', api);
    expect(view.getByRole('alert')).toHaveTextContent(t('common:errors.network'));
    await fireEvent.press(view.getByRole('button', { name: t('common:actions.retry') }));
    await wait(300);
    expect(view.getByTestId(map.searchResult)).toBeVisible();
    expect(view.queryByRole('alert')).toBeNull();
  });

  it('shows the rate-limit message for a 429', async () => {
    const api = fakeApi();
    api.places.search.mockReturnValue(respond(429, { title: 'Too Many Requests', status: 429 }));
    const { view } = await search('قلعه', api);
    expect(view.getByRole('alert')).toHaveTextContent(t('common:errors.rateLimited'));
  });

  it('hides the results when the query is cleared', async () => {
    const api = fakeApi();
    api.places.search.mockReturnValue(respond(200, { items: [citadel] }));
    const { view } = await search('قلعه', api);
    await fireEvent.changeText(view.getByTestId(map.searchInput), '  ');
    expect(view.queryByTestId(map.searchResult)).toBeNull();
    expect(api.places.search).toHaveBeenCalledTimes(1);
  });
});

describe('locate me', () => {
  const permission = jest.mocked(Location.requestForegroundPermissionsAsync);
  const position = jest.mocked(Location.getCurrentPositionAsync);

  it('centres on the user, shows the location dot and searches near them', async () => {
    permission.mockResolvedValue({ granted: true } as never);
    position.mockResolvedValue({ coords: { longitude: 44.4012, latitude: 33.3005 } } as never);
    const { api, view } = await show(screen);
    await fireEvent.press(await view.findByRole('button', { name: t('map:locate.label') }));
    expect(mapProps()).toMatchObject({ camera: { center: [44.4012, 33.3005], zoom: 15 }, showUserLocation: true });
    await fireEvent.changeText(view.getByTestId(map.searchInput), 'قلعه');
    await wait(300);
    expect(api.places.search.mock.calls[0]?.[0]?.query).toMatchObject({ near: '44.401200,33.300500' });
  });

  it('explains a denied permission and keeps the map as it was', async () => {
    permission.mockResolvedValue({ granted: false } as never);
    const { view } = await show(screen);
    await fireEvent.press(await view.findByTestId(map.locate));
    expect(view.getByRole('alert')).toHaveTextContent(t('map:locate.denied'));
    expect(position).not.toHaveBeenCalled();
    expect(mapProps()).toMatchObject({ camera: { bounds: city.bbox }, showUserLocation: false });
    expect(view.getByTestId(map.view)).toBeVisible();
  });

  it('reports a location that cannot be read (services off)', async () => {
    permission.mockResolvedValue({ granted: true } as never);
    position.mockRejectedValue(new Error('Location services are disabled'));
    const { view } = await show(screen);
    await fireEvent.press(await view.findByTestId(map.locate));
    expect(view.getByRole('alert')).toHaveTextContent(t('map:locate.unavailable'));
  });
});
