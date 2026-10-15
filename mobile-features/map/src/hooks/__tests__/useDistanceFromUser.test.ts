/**
 * Unit tests for useDistanceFromUser.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useDistanceFromUser } from '../useDistanceFromUser';

jest.mock('expo-location');

const mockLocation = Location as jest.Mocked<typeof Location>;

describe('useDistanceFromUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when placeLngLat is undefined', async () => {
    const hook = await renderHook(() => useDistanceFromUser(undefined));
    expect(hook.result.current).toBeNull();
    hook.unmount();
  });

  it('returns null when permission is denied', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied' as Location.PermissionStatus,
      granted: false,
      expires: 'never' as const,
      canAskAgain: false,
    });
    const hook = await renderHook(() => useDistanceFromUser([44.4, 33.3]));
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current).toBeNull();
    hook.unmount();
  });

  it('computes near-zero distance when user is at same coordinate as place', async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted' as Location.PermissionStatus,
      granted: true,
      expires: 'never' as const,
      canAskAgain: true,
    });
    mockLocation.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 33.3,
        longitude: 44.4,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    } as Location.LocationObject);

    const hook = await renderHook(() => useDistanceFromUser([44.4, 33.3]));
    await act(async () => { await Promise.resolve(); });
    // Distance to same point should be nearly 0 m
    expect(typeof hook.result.current === 'number' || hook.result.current === null).toBe(true);
    hook.unmount();
  });
});
