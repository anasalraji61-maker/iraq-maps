import { describe, expect, it, jest } from '@jest/globals';
import type { LngLat } from '@iraq-maps/contracts';
import { DeviationDetector } from '../deviation';

// A simple straight polyline along the equator: [0,0] → [0.01,0] ≈ 1.1 km
const LINE: LngLat[] = [
  [0, 0],
  [0.01, 0],
];

// A point sitting on the line (distance ≈ 0 m)
const ON_ROUTE: LngLat = [0.005, 0];

// A point ~500 m north of the line (well over 40 m)
const OFF_ROUTE: LngLat = [0.005, 0.005];

describe('DeviationDetector', () => {
  it('does NOT fire when all 3 fixes are on-route', () => {
    const cb = jest.fn();
    const d = new DeviationDetector(LINE, cb);
    d.feed(ON_ROUTE);
    d.feed(ON_ROUTE);
    d.feed(ON_ROUTE);
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires exactly once when 3 consecutive off-route fixes arrive', () => {
    const cb = jest.fn();
    const d = new DeviationDetector(LINE, cb);
    d.feed(OFF_ROUTE);
    d.feed(OFF_ROUTE);
    d.feed(OFF_ROUTE);
    expect(cb).toHaveBeenCalledTimes(1);
    // Extra fixes after firing should NOT trigger again (no reset)
    d.feed(OFF_ROUTE);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires again after reset()', () => {
    const cb = jest.fn();
    const d = new DeviationDetector(LINE, cb);
    d.feed(OFF_ROUTE);
    d.feed(OFF_ROUTE);
    d.feed(OFF_ROUTE);
    expect(cb).toHaveBeenCalledTimes(1);

    d.reset();

    d.feed(OFF_ROUTE);
    d.feed(OFF_ROUTE);
    d.feed(OFF_ROUTE);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('does NOT fire on 2 off-route + 1 on-route (window not full off-route)', () => {
    const cb = jest.fn();
    const d = new DeviationDetector(LINE, cb);
    d.feed(OFF_ROUTE);
    d.feed(OFF_ROUTE);
    d.feed(ON_ROUTE); // resets the streak
    d.feed(OFF_ROUTE);
    d.feed(OFF_ROUTE);
    expect(cb).not.toHaveBeenCalled();
  });
});
