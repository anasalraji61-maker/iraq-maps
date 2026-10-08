import { CityDescriptor, OSM_ATTRIBUTION, PlaceSummary, type Locale } from '@iraq-maps/contracts';
import { MapCanvas, type MapCanvasProps } from '@iraq-maps/map-kit';
import type { RouteName } from '@iraq-maps/mobile-kit';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { jest } from '@jest/globals';
import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';

export const city = CityDescriptor.parse({
  id: 'baghdad',
  names: { ar: 'بغداد', ckb: 'بەغدا', en: 'Baghdad' },
  bbox: [44.2, 33.2, 44.55, 33.45],
  center: [44.3661, 33.3152],
  tilesUrl: '/v1/cities/baghdad/tiles/{z}/{x}/{y}',
  glyphsUrl: '/v1/cities/baghdad/glyphs/{fontstack}/{range}.pbf',
  attribution: OSM_ATTRIBUTION,
});

export const citadel = PlaceSummary.parse({
  id: 'n1001',
  kind: 'place',
  names: { name: 'قلعة بغداد', en: 'Baghdad Citadel' },
  category: 'tourism',
  area: { name: 'الرصافة', en: 'Rusafa' },
  location: [44.38, 33.34],
  distanceM: 1234,
});
export const street = PlaceSummary.parse({ id: 'w2002', kind: 'street', names: { name: 'شارع القلعة' }, category: null, area: null, location: [44.37, 33.33], distanceM: 350 });

type Response = { status: number; body?: unknown };
type Request = { query?: Record<string, unknown>; params?: Record<string, string>; fetchOptions?: { signal: AbortSignal } };
export const respond = (status: number, body?: unknown): Promise<Response> => Promise.resolve({ status, body });

/** A response that the test settles later. */
export function later() {
  let settle!: (res: Response) => void;
  const promise = new Promise<Response>((resolve) => (settle = resolve));
  return { promise, settle };
}

/** Endpoints answer 500 until a test stubs them; the city list holds Baghdad. */
export function fakeApi() {
  const endpoint = () => jest.fn((_req?: Request) => respond(500));
  const api = { cities: { list: endpoint() }, places: { search: endpoint(), get: endpoint() } };
  api.cities.list.mockImplementation(() => respond(200, { items: [city] }));
  return api;
}

/** Renders `ui` with a fake API (fakeApi() unless given), in Arabic unless `locale` says otherwise. */
export async function show(ui: ReactElement, opts: { api?: ReturnType<typeof fakeApi>; locale?: Locale; availableRoutes?: RouteName[] } = {}) {
  const { api = fakeApi(), locale = 'ar', availableRoutes } = opts;
  const view = await renderWithProviders(ui, { api: api as never, locale, availableRoutes });
  return { api, view, router: jest.mocked(useRouter()) };
}

/** The props MapCanvas got on its last render. */
export const mapProps = (): MapCanvasProps => jest.mocked(MapCanvas).mock.lastCall![0];
