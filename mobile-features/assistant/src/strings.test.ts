/**
 * Unit tests for assistant strings t() helper.
 */
import { describe, expect, it } from '@jest/globals';
import { t } from './strings';

describe('t (assistant namespace)', () => {
  it('returns a non-empty string for chat.title', () => {
    const result = t('chat.title');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for chat.send', () => {
    expect(t('chat.send').length).toBeGreaterThan(0);
  });

  it('interpolates content into chat.msgFromAssistant', () => {
    const result = t('chat.msgFromAssistant', { content: 'Hello' });
    expect(result).toContain('Hello');
  });

  it('interpolates count and max into chat.charCount', () => {
    const result = t('chat.charCount', { count: '5', max: '200' });
    expect(result).toContain('5');
  });

  it('interpolates count into chat.showPlacesOnMap', () => {
    const result = t('chat.showPlacesOnMap', { count: '3' });
    expect(result).toContain('3');
  });

  it('returns a non-empty string for chat.loading', () => {
    expect(t('chat.loading').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for chat.error', () => {
    expect(t('chat.error').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for chat.clearChat', () => {
    expect(t('chat.clearChat').length).toBeGreaterThan(0);
  });
});
