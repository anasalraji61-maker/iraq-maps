/**
 * Unit tests for activity strings t() helper.
 */
import { describe, expect, it } from '@jest/globals';
import { t } from './strings';

describe('t (activity namespace)', () => {
  it('returns a non-empty string for title', () => {
    const result = t('title');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for tabNotifications', () => {
    expect(t('tabNotifications').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for tabRoutes', () => {
    expect(t('tabRoutes').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for markAllRead', () => {
    expect(t('markAllRead').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for retry', () => {
    expect(t('retry').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for loadMore', () => {
    expect(t('loadMore').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for empty', () => {
    expect(t('empty').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for loadError', () => {
    expect(t('loadError').length).toBeGreaterThan(0);
  });
});
