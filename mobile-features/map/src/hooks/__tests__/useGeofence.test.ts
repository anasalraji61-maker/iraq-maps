/**
 * Unit tests for useGeofence hook.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import type { LngLat } from '@iraq-maps/contracts';
import { useGeofence, type GeofenceZone } from '../useGeofence';

const SQUARE_ZONE: GeofenceZone = {
  id: 'zone1',
  name: 'Test Zone',
  polygon: [
    [44.0, 33.0],
    [44.1, 33.0],
    [44.1, 33.1],
    [44.0, 33.1],
  ],
};

describe('useGeofence', () => {
  let onEnter: jest.Mock;

  beforeEach(() => {
    onEnter = jest.fn();
  });

  it('does not call onEnter when userPosition is null', async () => {
    await act(async () => {
      renderHook(() =>
        useGeofence({ zones: [SQUARE_ZONE], userPosition: null, onEnter }),
      );
    });
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('does not call onEnter when user is outside zone', async () => {
    const outside: LngLat = [45.0, 35.0];
    await act(async () => {
      renderHook(() =>
        useGeofence({ zones: [SQUARE_ZONE], userPosition: outside, onEnter }),
      );
    });
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('calls onEnter when user is inside the zone', async () => {
    const inside: LngLat = [44.05, 33.05];
    await act(async () => {
      renderHook(() =>
        useGeofence({ zones: [SQUARE_ZONE], userPosition: inside, onEnter }),
      );
    });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith(SQUARE_ZONE);
  });

  it('handles multiple zones — only fires for the matching zone', async () => {
    const zone2: GeofenceZone = {
      id: 'zone2',
      name: 'Zone Two',
      polygon: [
        [45.0, 34.0],
        [45.1, 34.0],
        [45.1, 34.1],
        [45.0, 34.1],
      ],
    };
    const insideZone2: LngLat = [45.05, 34.05];

    await act(async () => {
      renderHook(() =>
        useGeofence({ zones: [SQUARE_ZONE, zone2], userPosition: insideZone2, onEnter }),
      );
    });

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith(zone2);
  });

  it('does not fire for an empty zones list', async () => {
    const inside: LngLat = [44.05, 33.05];
    await act(async () => {
      renderHook(() =>
        useGeofence({ zones: [], userPosition: inside, onEnter }),
      );
    });
    expect(onEnter).not.toHaveBeenCalled();
  });
});
