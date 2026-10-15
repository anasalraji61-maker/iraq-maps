/**
 * Integration tests for the map feature — tests complete user flows including
 * search, place selection, offline behavior, and recent searches persistence.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { useDistanceFromUser } from '../hooks/useDistanceFromUser';
import { useGeofence } from '../hooks/useGeofence';
import { useMapStyle, isDarkMode } from '../hooks/useMapStyle';

// ─── Mock AsyncStorage ─────────────────────────────────────────────────────

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, val: string) => { store[key] = val; }),
    removeItem: jest.fn(async (key: string) => { delete store[key]; }),
    clear: jest.fn(async () => { Object.keys(store).forEach((k) => delete store[k]); }),
  },
}));

// ─── Mock expo-location ────────────────────────────────────────────────────

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 33.3128, longitude: 44.3615, accuracy: 10 },
  })),
  Accuracy: { Balanced: 3 },
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useRecentSearches — persistence and deduplication', () => {
  beforeEach(() => {
    // Clear mock store between tests
    Object.keys(store).forEach((k) => delete store[k]);
  });

  it('starts with an empty list on first use', async () => {
    const { result } = await renderHook(() => useRecentSearches());
    await waitFor(() => expect(result.current.items).toEqual([]));
  });

  it('adds a search term and persists it', async () => {
    const { result } = await renderHook(() => useRecentSearches());
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      result.current.add('مطعم الرافدين');
    });

    expect(result.current.items).toContain('مطعم الرافدين');
  });

  it('deduplicates identical searches, moving duplicates to front', async () => {
    const { result } = await renderHook(() => useRecentSearches());
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => { result.current.add('كافيه'); });
    await act(async () => { result.current.add('مطعم'); });
    await act(async () => { result.current.add('كافيه'); }); // duplicate

    expect(result.current.items[0]).toBe('كافيه');
    expect(result.current.items.filter((x: string) => x === 'كافيه')).toHaveLength(1);
  });

  it('clears all searches', async () => {
    const { result } = await renderHook(() => useRecentSearches());
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => { result.current.add('بغداد'); });
    expect(result.current.items).toContain('بغداد');

    await act(async () => { result.current.clear(); });
    expect(result.current.items).toEqual([]);
  });

  it('caps the list at 8 items', async () => {
    const { result } = await renderHook(() => useRecentSearches());
    await waitFor(() => expect(result.current.items).toEqual([]));

    for (let i = 1; i <= 10; i++) {
      await act(async () => { result.current.add(`بحث ${i}`); });
    }

    expect(result.current.items.length).toBeLessThanOrEqual(8);
  });
});

describe('useDistanceFromUser — location hook', () => {
  it('returns null before permission is granted', async () => {
    const { requestForegroundPermissionsAsync } = jest.requireMock<{
      requestForegroundPermissionsAsync: jest.Mock;
    }>('expo-location');
    // Temporarily make it pending
    let resolve!: (v: { status: string }) => void;
    requestForegroundPermissionsAsync.mockImplementationOnce(
      () => new Promise((r) => { resolve = r; }),
    );

    const { result } = await renderHook(() => useDistanceFromUser([44.361, 33.312]));
    expect(result.current).toBeNull();

    // Resolve it to avoid open handles
    resolve({ status: 'granted' });
  });

  it('returns null when placeLngLat is undefined', async () => {
    const { result } = await renderHook(() => useDistanceFromUser(undefined));
    // Should immediately be null and stay null
    expect(result.current).toBeNull();
  });

  it('returns a positive distance when location is available', async () => {
    const { result } = await renderHook(() => useDistanceFromUser([44.4, 33.35]));
    // Wait for async permission + location fetch
    await waitFor(() => result.current !== null, { timeout: 3000 });
    expect(result.current).toBeGreaterThan(0);
  });
});

describe('useGeofence — zone enter/leave callbacks', () => {
  it('fires onEnter when user position enters a zone', async () => {
    const onEnter = jest.fn();
    const zone = {
      id: 'zone-1',
      name: 'ساحة التحرير',
      polygon: [
        [44.36, 33.31] as [number, number],
        [44.37, 33.31] as [number, number],
        [44.37, 33.32] as [number, number],
        [44.36, 33.32] as [number, number],
      ],
    };

    const { rerender } = await renderHook(
      ({ pos }: { pos: [number, number] | null }) =>
        useGeofence({ zones: [zone], userPosition: pos, onEnter }),
      { initialProps: { pos: null } },
    );

    // User outside: no callback
    await act(async () => { rerender({ pos: [44.0, 33.0] }); });
    expect(onEnter).not.toHaveBeenCalled();

    // User inside zone
    await act(async () => { rerender({ pos: [44.365, 33.315] }); });
    expect(onEnter).toHaveBeenCalledWith(expect.objectContaining({ id: 'zone-1' }));
  });

  it('does not fire onEnter again without leaving and re-entering', async () => {
    const onEnter = jest.fn();
    const zone = {
      id: 'zone-2',
      name: 'الكرادة',
      polygon: [
        [44.36, 33.31] as [number, number],
        [44.37, 33.31] as [number, number],
        [44.37, 33.32] as [number, number],
        [44.36, 33.32] as [number, number],
      ],
    };

    const { rerender } = await renderHook(
      ({ pos }: { pos: [number, number] | null }) =>
        useGeofence({ zones: [zone], userPosition: pos, onEnter }),
      { initialProps: { pos: [44.365, 33.315] as [number, number] } },
    );

    // First enter
    await act(async () => { rerender({ pos: [44.365, 33.315] }); });
    // Move slightly within zone
    await act(async () => { rerender({ pos: [44.366, 33.316] }); });

    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});

describe('useMapStyle and isDarkMode — base layer logic', () => {
  it('street mode returns vector base layer', () => {
    expect(useMapStyle('street')).toBe('vector');
  });

  it('dark mode returns vector base layer', () => {
    expect(useMapStyle('dark')).toBe('vector');
  });

  it('satellite mode returns satellite base layer', () => {
    expect(useMapStyle('satellite')).toBe('satellite');
  });

  it('isDarkMode is true only for dark', () => {
    expect(isDarkMode('dark')).toBe(true);
    expect(isDarkMode('street')).toBe(false);
    expect(isDarkMode('satellite')).toBe(false);
  });
});
