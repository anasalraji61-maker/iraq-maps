import type { PlaceId } from './common';

/** Reserved for a later phase (3D walk-through). Type only; no implementation exists. */
export interface Tour3DPort {
  getTour(placeId: PlaceId): Promise<{ placeId: PlaceId; sceneUrl: string; attribution: string } | null>;
}
