/**
 * Unit tests for messages strings t() helper.
 */
import { describe, expect, it } from '@jest/globals';
import { t } from './strings';

describe('t (messages namespace)', () => {
  it('returns a non-empty string for compose.title', () => {
    const result = t('compose.title');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for compose.placeholder', () => {
    expect(t('compose.placeholder').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for compose.continue', () => {
    expect(t('compose.continue').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for confirm.title', () => {
    expect(t('confirm.title').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for confirm.send', () => {
    expect(t('confirm.send').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for compose.addPlace', () => {
    expect(t('compose.addPlace').length).toBeGreaterThan(0);
  });

  it('interpolates charCount params', () => {
    const result = t('compose.charCount', { count: '10', max: '500' });
    expect(result).toContain('10');
  });

  it('returns a non-empty string for confirm.offline', () => {
    expect(t('confirm.offline').length).toBeGreaterThan(0);
  });
});
