import type { LngLat } from '@iraq-maps/contracts';
import { distanceToPolylineM } from '@iraq-maps/geo';

const WINDOW = 3;
const THRESHOLD_M = 40;

/**
 * Fires `onDeviate` when the last WINDOW consecutive GPS fixes are all further than THRESHOLD_M
 * from the polyline. Resets after each deviation event (call reset() to arm again after reroute).
 */
export class DeviationDetector {
  private readonly _line: readonly LngLat[];
  private readonly _onDeviate: () => void;
  private _buffer: number[] = [];
  private _fired = false;

  constructor(polyline: readonly LngLat[], onDeviate: () => void) {
    this._line = polyline;
    this._onDeviate = onDeviate;
  }

  feed(position: LngLat): void {
    if (this._fired) return;
    const dist = distanceToPolylineM(position, this._line);
    this._buffer.push(dist);
    if (this._buffer.length > WINDOW) this._buffer.shift();
    if (this._buffer.length === WINDOW && this._buffer.every((d) => d > THRESHOLD_M)) {
      this._fired = true;
      this._onDeviate();
    }
  }

  /** Call after a reroute to arm the detector for the new polyline. */
  reset(): void {
    this._buffer = [];
    this._fired = false;
  }
}
