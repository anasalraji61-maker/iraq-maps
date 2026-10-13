import type { LngLat } from '@iraq-maps/contracts';
import { useEffect, type RefObject } from 'react';

export interface CameraLike {
  setCamera(options: { centerCoordinate: LngLat; animationDuration: number; heading?: number }): void;
}

export interface UseFollowUserProps {
  cameraRef: RefObject<CameraLike | null>;
  active: boolean;
  location?: LngLat;
  heading?: number;
}

/**
 * When `active` and `location` is set, calls `cameraRef.current.setCamera` to keep the camera centred
 * on the user location with a smooth 300 ms animation.
 * @public M2
 */
export function useFollowUser({ cameraRef, active, location, heading }: UseFollowUserProps): void {
  useEffect(() => {
    if (!active || !location) return;
    cameraRef.current?.setCamera({
      centerCoordinate: location,
      animationDuration: 300,
      ...(heading !== undefined ? { heading } : {}),
    });
  }, [active, location, heading, cameraRef]);
}
