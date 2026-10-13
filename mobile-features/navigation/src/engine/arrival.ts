import type { LngLat } from '@iraq-maps/contracts';
import { haversineM } from '@iraq-maps/geo';

const THRESHOLD_M = 30;
const REQUIRED = 2;

/**
 * Fires `onArrive` when REQUIRED consecutive GPS fixes are within THRESHOLD_M of the destination.
 */
export class ArrivalDetector {
  private readonly _onArrive: () => void;
  private _consecutiveNear = 0;
  private _arrived = false;

  constructor(onArrive: () => void) {
    this._onArrive = onArrive;
  }

  feed(position: LngLat, destination: LngLat): void {
    if (this._arrived) return;
    const dist = haversineM(position, destination);
    if (dist <= THRESHOLD_M) {
      this._consecutiveNear++;
      if (this._consecutiveNear >= REQUIRED) {
        this._arrived = true;
        this._onArrive();
      }
    } else {
      this._consecutiveNear = 0;
    }
  }
}
