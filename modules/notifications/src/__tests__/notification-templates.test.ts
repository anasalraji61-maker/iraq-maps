import { describe, expect, it } from 'vitest';
import {
  isTemplateType,
  renderNotification,
  renderNotificationAllLocales,
  type NotificationLocale,
  type NotificationTemplateType,
} from '../notification-templates';

describe('renderNotification', () => {
  describe('message.new', () => {
    it('renders Arabic', () => {
      const result = renderNotification('message.new', { name: 'أحمد', preview: 'مرحبا' }, 'ar');
      expect(result.title).toBe('رسالة جديدة');
      expect(result.body).toContain('أحمد');
      expect(result.body).toContain('مرحبا');
    });

    it('renders English', () => {
      const result = renderNotification('message.new', { name: 'Ahmed', preview: 'Hello' }, 'en');
      expect(result.title).toBe('New message');
      expect(result.body).toContain('Ahmed');
      expect(result.body).toContain('Hello');
    });

    it('renders Kurdish', () => {
      const result = renderNotification('message.new', { name: 'ئەحمەد', preview: 'سڵاو' }, 'ckb');
      expect(result.title).toBe('پەیامی نوێ');
      expect(result.body).toContain('ئەحمەد');
    });
  });

  describe('review.helpful', () => {
    it('interpolates count in Arabic', () => {
      const result = renderNotification('review.helpful', { count: 5 }, 'ar');
      expect(result.body).toContain('5');
    });
  });

  describe('follow.new', () => {
    it('interpolates name', () => {
      const ar = renderNotification('follow.new', { name: 'سارة' }, 'ar');
      expect(ar.body).toContain('سارة');

      const en = renderNotification('follow.new', { name: 'Sara' }, 'en');
      expect(en.body).toContain('Sara');
    });
  });

  describe('place.nearby', () => {
    it('interpolates placeName', () => {
      const result = renderNotification('place.nearby', { placeName: 'مطعم النهرين' }, 'ar');
      expect(result.body).toContain('مطعم النهرين');
    });
  });

  describe('incident.confirmed', () => {
    it('interpolates type and street', () => {
      const result = renderNotification(
        'incident.confirmed',
        { type: 'حريق', street: 'شارع الرشيد' },
        'ar',
      );
      expect(result.body).toContain('حريق');
      expect(result.body).toContain('شارع الرشيد');
    });
  });

  describe('event.reminder', () => {
    it('interpolates eventName', () => {
      const result = renderNotification('event.reminder', { eventName: 'معرض بغداد' }, 'ar');
      expect(result.body).toContain('معرض بغداد');
    });
  });

  describe('review.response', () => {
    it('interpolates businessName', () => {
      const result = renderNotification('review.response', { businessName: 'فندق الرشيد' }, 'ar');
      expect(result.body).toContain('فندق الرشيد');
    });
  });

  describe('achievement.unlocked', () => {
    it('interpolates badgeName', () => {
      const result = renderNotification('achievement.unlocked', { badgeName: 'مستكشف' }, 'ar');
      expect(result.body).toContain('مستكشف');
      expect(result.title).toContain('شارة');
    });
  });

  describe('trending.place', () => {
    it('interpolates placeName and city', () => {
      const result = renderNotification(
        'trending.place',
        { placeName: 'ساحة التحرير', city: 'بغداد' },
        'ar',
      );
      expect(result.body).toContain('ساحة التحرير');
      expect(result.body).toContain('بغداد');
    });
  });

  describe('unknown placeholder', () => {
    it('leaves unmatched placeholders as-is', () => {
      const result = renderNotification('message.new', { name: 'أحمد' }, 'ar');
      // preview not provided — placeholder should remain
      expect(result.body).toContain('{preview}');
    });
  });

  describe('fallback locale', () => {
    it('falls back to Arabic for unknown locale', () => {
      const result = renderNotification(
        'message.new',
        { name: 'أحمد', preview: 'مرحبا' },
        'xx' as NotificationLocale,
      );
      expect(result.title).toBe('رسالة جديدة');
    });
  });
});

describe('renderNotificationAllLocales', () => {
  it('returns all three locales', () => {
    const all = renderNotificationAllLocales('follow.new', { name: 'Ali' });
    expect(all.ar.body).toBeTruthy();
    expect(all.ckb.body).toBeTruthy();
    expect(all.en.body).toBeTruthy();
  });

  it('each locale contains the interpolated value', () => {
    const all = renderNotificationAllLocales('follow.new', { name: 'Ali' });
    for (const locale of ['ar', 'ckb', 'en'] as NotificationLocale[]) {
      expect(all[locale].body).toContain('Ali');
    }
  });
});

describe('isTemplateType', () => {
  it('returns true for valid types', () => {
    const valid: NotificationTemplateType[] = [
      'message.new',
      'review.helpful',
      'follow.new',
      'place.nearby',
      'incident.confirmed',
      'event.reminder',
      'review.response',
      'achievement.unlocked',
      'trending.place',
    ];
    for (const t of valid) {
      expect(isTemplateType(t)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isTemplateType('unknown')).toBe(false);
    expect(isTemplateType('')).toBe(false);
    expect(isTemplateType('message')).toBe(false);
  });
});
