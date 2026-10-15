/**
 * Unit tests for discover strings t() helper.
 */
import { describe, expect, it } from '@jest/globals';
import { t } from './strings';

describe('t (discover namespace)', () => {
  it('returns a non-empty string for feed.title', () => {
    const result = t('feed.title');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for feed.loading', () => {
    expect(t('feed.loading').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for feed.empty', () => {
    expect(t('feed.empty').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for feed.retry', () => {
    expect(t('feed.retry').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for feed.networkError', () => {
    expect(t('feed.networkError').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for feed.searchPlaceholder', () => {
    expect(t('feed.searchPlaceholder').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for feed.trendingTitle', () => {
    expect(t('feed.trendingTitle').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for feed.loadMore', () => {
    expect(t('feed.loadMore').length).toBeGreaterThan(0);
  });
});
