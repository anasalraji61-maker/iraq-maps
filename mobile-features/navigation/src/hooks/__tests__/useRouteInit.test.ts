/**
 * Unit tests for useRouteInit.
 * Mocks expo-location and the API client.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import * as Location from 'expo-location';

jest.mock('expo-location');
jest.mock('@iraq-maps/mobile-kit', () => ({
  useApi: jest.fn(),
}));

import { useApi } from '@iraq-maps/mobile-kit';
import { useRouteInit } from '../useRouteInit';

const mockLocation = Location as jest.Mocked<typeof Location>;
const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

const COORDS = { longitude: 44.4, latitude: 33.3 };
const PLACE_BODY = {
  id: 'n1001',
  kind: 'place',
  names: { ar: 'قلعة بغداد', en: 'Baghdad Citadel' },
  category: 'tourism',
  area: { name: 'الرصافة' },
  location: [44.38, 33.34],
};
const ROUTE_BODY = {
  polyline6: 'wvzlBemr{Ai@aB',
  distanceM: 2000,
  durationS: 180,
  bbox: [44.38, 33.3, 44.41, 33.34],
  maneuvers: [
    { type: 'depart', streetNames: [], distanceM: 2000, durationS: 180, beginShapeIndex: 0 },
    { type: 'arrive', streetNames: [], distanceM: 0, durationS: 0, beginShapeIndex: 1 },
  ],
};
const CITY_BODY = {
  id: 'baghdad',
  names: { ar: 'بغداد' },
  bbox: [44.2, 33.2, 44.55, 33.45],
  center: [44.37, 33.32],
  tilesUrl: '/tiles',
  glyphsUrl: '/glyphs/{fontstack}/{range}.pbf',
  attribution: '© OpenStreetMap contributors',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeFn(value: unknown): AnyFn { return (jest.fn() as AnyFn).mockResolvedValue(value) as AnyFn; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeApi(): any {
  return {
    places: { get: makeFn({ status: 200, body: PLACE_BODY }) },
    cities: { list: makeFn({ status: 200, body: { items: [CITY_BODY] } }) },
    routes: { create: makeFn({ status: 200, body: ROUTE_BODY }) },
  };
}

describe('useRouteInit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted' as Location.PermissionStatus,
      granted: true,
      expires: 'never' as const,
      canAskAgain: true,
    });
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: { ...COORDS, altitude: null, accuracy: 10, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
      mocked: false,
    });
  });

  it('starts with result=null before async work completes', async () => {
    const api = makeApi();
    // Make the API call hang so we can inspect the initial state
    api.places.get = jest.fn(() => new Promise(() => {})) as never;
    mockUseApi.mockReturnValue(api as never);
    const hook = await renderHook(() => useRouteInit('n1001', 'car'));
    expect(hook.result.current.result).toBeNull();
    hook.unmount();
  });

  it('resolves with route result on success', async () => {
    const api = makeApi();
    mockUseApi.mockReturnValue(api as never);
    const hook = await renderHook(() => useRouteInit('n1001', 'car'));
    await act(async () => {});
    expect(hook.result.current.result).not.toBeNull();
    expect(hook.result.current.isLoading).toBe(false);
    expect(hook.result.current.error).toBeUndefined();
    hook.unmount();
  });

  it('sets error when location permission is denied', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied' as Location.PermissionStatus,
      granted: false,
      expires: 'never' as const,
      canAskAgain: false,
    });
    const api = makeApi();
    mockUseApi.mockReturnValue(api as never);
    const hook = await renderHook(() => useRouteInit('n1001', 'car'));
    await act(async () => {});
    expect(hook.result.current.error).toBeTruthy();
    expect(hook.result.current.result).toBeNull();
    hook.unmount();
  });

  it('sets error when place fetch fails', async () => {
    const api = makeApi();
    api.places.get.mockResolvedValue({ status: 404 });
    mockUseApi.mockReturnValue(api as never);
    const hook = await renderHook(() => useRouteInit('n1001', 'car'));
    await act(async () => {});
    expect(hook.result.current.error).toBeTruthy();
    hook.unmount();
  });

  it('sets error when route request fails', async () => {
    const api = makeApi();
    api.routes.create.mockResolvedValue({ status: 500 });
    mockUseApi.mockReturnValue(api as never);
    const hook = await renderHook(() => useRouteInit('n1001', 'car'));
    await act(async () => {});
    expect(hook.result.current.error).toBeTruthy();
    hook.unmount();
  });

  it('sets error on unexpected exception', async () => {
    mockLocation.getCurrentPositionAsync.mockRejectedValue(new Error('GPS off'));
    const api = makeApi();
    mockUseApi.mockReturnValue(api as never);
    const hook = await renderHook(() => useRouteInit('n1001', 'car'));
    await act(async () => {});
    expect(hook.result.current.error).toBeTruthy();
    hook.unmount();
  });

  it('does nothing when placeId is undefined', async () => {
    const api = makeApi();
    mockUseApi.mockReturnValue(api as never);
    const hook = await renderHook(() => useRouteInit(undefined, 'car'));
    await act(async () => {});
    // Should remain in loading limbo since the effect never runs
    expect(hook.result.current.result).toBeNull();
    hook.unmount();
  });
});
