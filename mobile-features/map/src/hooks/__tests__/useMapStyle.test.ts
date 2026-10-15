/**
 * Unit tests for useMapStyle.
 */
import { describe, expect, it } from '@jest/globals';
import { useMapStyle } from '../useMapStyle';

describe('useMapStyle', () => {
  it('returns vector for street mode', () => {
    expect(useMapStyle('street')).toBe('vector');
  });

  it('returns satellite for satellite mode', () => {
    expect(useMapStyle('satellite')).toBe('satellite');
  });
});
