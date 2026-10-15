/**
 * Unit tests for navigation strings t() helper.
 */
import { describe, expect, it } from '@jest/globals';
import { t } from './strings';

describe('t (navigation namespace)', () => {
  it('returns a non-empty string for active.arrived', () => {
    const result = t('active.arrived');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for active.stop', () => {
    expect(t('active.stop').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for active.rerouting', () => {
    expect(t('active.rerouting').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for active.close', () => {
    expect(t('active.close').length).toBeGreaterThan(0);
  });

  it('interpolates n into active.distM', () => {
    const result = t('active.distM', { n: '500' });
    expect(result).toContain('500');
  });

  it('interpolates n into active.distKm', () => {
    const result = t('active.distKm', { n: '1.5' });
    expect(result).toContain('1.5');
  });

  it('returns a non-empty string for active.eta', () => {
    expect(t('active.eta').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for active.navigateAgain', () => {
    expect(t('active.navigateAgain').length).toBeGreaterThan(0);
  });
});
