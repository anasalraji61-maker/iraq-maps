import { OSM_ATTRIBUTION, PlaceDetails, testIDs } from '@iraq-maps/contracts';
import { t } from '@iraq-maps/i18n';
import type { RouteName } from '@iraq-maps/mobile-kit';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Share } from 'react-native';
import { PlaceScreen } from '../src';
import { citadel, fakeApi, respond, show } from './render';

const { place } = testIDs;
const details = PlaceDetails.parse({
  ...citadel,
  hoursRaw: 'Sa-Th 09:00-17:00; Fr off',
  osmContacts: { phone: '+964 770 123 4567', website: 'https://example.com/citadel' },
  source: 'osm',
  attribution: OSM_ATTRIBUTION,
});
const actionRoutes: ['directions' | 'message' | 'assistant', RouteName][] = [
  ['directions', 'routePreview'],
  ['message', 'messageCompose'],
  ['assistant', 'assistant'],
];
/** The action buttons on screen, found by their accessible names. */
const shownActions = (view: Awaited<ReturnType<typeof show>>['view']) =>
  actionRoutes.map(([key]) => key).filter((key) => view.queryByRole('button', { name: t(`map:actions.${key}`) }));
const isolated = (text: string) => `\u2068${text}\u2069`;

/** Opens the card for `body` (a PlaceDetails, or the given status) with the clock at `now` (Baghdad is UTC+3). */
async function open(body: unknown = details, opts: { now?: string; status?: number; availableRoutes?: RouteName[] } = {}) {
  const { now = '2026-10-08T10:00:00+03:00', status = 200, availableRoutes } = opts;
  jest.useFakeTimers({ now: new Date(now) });
  const api = fakeApi();
  api.places.get.mockReturnValue(respond(status, body));
  const shown = await show(<PlaceScreen />, { api, availableRoutes });
  if (status === 200) await shown.view.findByTestId(place.card);
  return shown;
}

beforeEach(() => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ placeId: 'n1001' });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('PlaceScreen', () => {
  it('shows the name, category, area, open now and the OSM contacts under a source badge', async () => {
    const { api, view } = await open();
    expect(api.places.get).toHaveBeenCalledWith({ params: { id: 'n1001' } });
    expect(view.getByTestId(place.card)).toBeVisible();
    expect(view.getByTestId(place.name)).toHaveTextContent('قلعة بغداد');
    expect(view.getByTestId(place.category)).toHaveTextContent(t('map:categories.tourism'));
    expect(view.getByText('الرصافة')).toBeVisible();
    expect(view.getByTestId(place.source)).toHaveTextContent(t('map:source.osm'));
    expect(view.getByText(isolated('Sa-Th 09:00-17:00; Fr off'))).toBeVisible();
    expect(view.getByText(t('map:place.openNow'))).toBeVisible();
    expect(view.getByText(isolated('+964 770 123 4567'))).toBeVisible();
    expect(view.getByText(isolated('https://example.com/citadel'))).toBeVisible();
    expect(view.getByText(OSM_ATTRIBUTION)).toBeVisible();
  });

  it('says closed now on its day off', async () => {
    const { view } = await open(details, { now: '2026-10-09T10:00:00+03:00' });
    expect(view.getByText(t('map:place.closedNow'))).toBeVisible();
    expect(view.queryByText(t('map:place.openNow'))).toBeNull();
  });

  it('shows hours it cannot parse as raw text, with no open or closed claim', async () => {
    const { view } = await open({ ...details, hoursRaw: 'Mo-Fr 08:00-17:00; PH off' });
    expect(view.getByText(isolated('Mo-Fr 08:00-17:00; PH off'))).toBeVisible();
    expect(view.queryByText(t('map:place.openNow'))).toBeNull();
    expect(view.queryByText(t('map:place.closedNow'))).toBeNull();
  });

  it('leaves out the hours and contacts OSM does not have', async () => {
    const { view } = await open({ ...details, hoursRaw: null, osmContacts: {} });
    expect(view.queryByText(t('map:place.hours'))).toBeNull();
    expect(view.queryByText(t('map:place.phone'))).toBeNull();
    expect(view.queryByText(t('map:place.website'))).toBeNull();
    expect(view.getByTestId(place.source)).toBeVisible();
  });

  it('shares the iraqmaps://place/<id> link with the name', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const { view } = await open();
    await fireEvent.press(view.getByTestId(place.share));
    expect(share).toHaveBeenCalledWith({ message: 'قلعة بغداد\niraqmaps://place/n1001' });
    share.mockRestore();
  });

  it.each([
    [404, t('map:place.notFound')],
    [500, t('common:errors.generic')],
  ])('shows a %i as a message with a retry', async (status, message) => {
    const { api, view } = await open({ title: 'x', status }, { status });
    expect(await view.findByRole('alert')).toHaveTextContent(message);
    api.places.get.mockReturnValue(respond(200, details));
    await fireEvent.press(view.getByRole('button', { name: t('common:actions.retry') }));
    expect(await view.findByTestId(place.card)).toBeVisible();
  });

  it.each([undefined, '', '../me', 'n1/../../me', '%2e%2e', 'n1?x=1', 'x'.repeat(65)])(
    'shows not found for the deep-link id %j without calling the API',
    async (placeId) => {
      jest.mocked(useLocalSearchParams).mockReturnValue(placeId === undefined ? {} : { placeId });
      const { api, view } = await show(<PlaceScreen />);
      expect(view.getByRole('alert')).toHaveTextContent(t('map:place.notFound'));
      expect(api.places.get).not.toHaveBeenCalled();
    },
  );

  it('hides the directions, message and assistant actions while their screens are not delivered', async () => {
    const { view } = await open(details, { availableRoutes: ['map', 'place'] });
    expect(shownActions(view)).toEqual([]);
    expect(view.getByTestId(place.share)).toBeVisible();
  });

  it.each(actionRoutes)('shows %s only once %s is delivered', async (key, route) => {
    const { view } = await open(details, { availableRoutes: ['map', 'place', route] });
    expect(shownActions(view)).toEqual([key]);
  });

  it('shows each action once its screen is delivered, and opens it for this place', async () => {
    const { router, view } = await open();
    for (const [key, pathname] of [
      ['directions', '/route/[placeId]'],
      ['message', '/messages/new'],
      ['assistant', '/assistant'],
    ] as const) {
      await fireEvent.press(view.getByRole('button', { name: t(`map:actions.${key}`) }));
      expect(router.push).toHaveBeenLastCalledWith({ pathname, params: { placeId: 'n1001' } });
    }
  });
});
