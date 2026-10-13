import { describe, expect, it, jest } from '@jest/globals';
import type { LngLat } from '@iraq-maps/contracts';
import { ArrivalDetector } from '../arrival';

// Destination point
const DEST: LngLat = [44.4, 33.3];

// Within 30 m (same point)
const NEAR: LngLat = [44.4, 33.3];

// ~1 km away
const FAR: LngLat = [44.41, 33.3];

describe('ArrivalDetector', () => {
  it('does NOT fire on a single near fix', () => {
    const cb = jest.fn();
    const a = new ArrivalDetector(cb);
    a.feed(NEAR, DEST);
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires on 2 consecutive near fixes', () => {
    const cb = jest.fn();
    const a = new ArrivalDetector(cb);
    a.feed(NEAR, DEST);
    a.feed(NEAR, DEST);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('resets the counter when a far fix interrupts', () => {
    const cb = jest.fn();
    const a = new ArrivalDetector(cb);
    a.feed(NEAR, DEST);
    a.feed(FAR, DEST); // breaks the streak
    a.feed(NEAR, DEST);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT fire again after arrival', () => {
    const cb = jest.fn();
    const a = new ArrivalDetector(cb);
    a.feed(NEAR, DEST);
    a.feed(NEAR, DEST);
    a.feed(NEAR, DEST);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
