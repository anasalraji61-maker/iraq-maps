/**
 * Notification template renderer.
 * All user-visible strings are produced here; callers get ready-to-send title/body pairs.
 * Supports ar (Arabic, default), ckb (Kurdish Sorani), en (English).
 */

export type NotificationLocale = 'ar' | 'ckb' | 'en';

export type NotificationTemplateType =
  | 'message.new'
  | 'review.helpful'
  | 'follow.new'
  | 'place.nearby'
  | 'incident.confirmed'
  | 'event.reminder'
  | 'review.response'
  | 'achievement.unlocked'
  | 'trending.place';

export interface NotificationContent {
  title: string;
  body: string;
}

// ─── Per-locale string tables ────────────────────────────────────────────────

type TemplateStrings = {
  [K in NotificationTemplateType]: {
    title: string;
    body: string;
  };
};

const STRINGS: Record<NotificationLocale, TemplateStrings> = {
  ar: {
    'message.new': {
      title: 'رسالة جديدة',
      body: 'رسالة جديدة من {name}: {preview}',
    },
    'review.helpful': {
      title: 'تقييمك مفيد',
      body: 'وجد {count} شخص تقييمك مفيداً',
    },
    'follow.new': {
      title: 'متابع جديد',
      body: 'بدأ {name} بمتابعتك',
    },
    'place.nearby': {
      title: 'مكان مميز قريب منك',
      body: 'مكان مميز قريب منك: {placeName}',
    },
    'incident.confirmed': {
      title: 'تنبيه حادث',
      body: 'تأكد حادث {type} قرب {street}',
    },
    'event.reminder': {
      title: 'تذكير بحدث',
      body: 'تذكير: {eventName} غداً',
    },
    'review.response': {
      title: 'رد على تقييمك',
      body: '{businessName} رد على تقييمك',
    },
    'achievement.unlocked': {
      title: 'شارة جديدة!',
      body: 'حصلت على شارة {badgeName}!',
    },
    'trending.place': {
      title: 'مكان رائج',
      body: '{placeName} يتصدر الترند في {city}',
    },
  },

  ckb: {
    'message.new': {
      title: 'پەیامی نوێ',
      body: 'پەیامی نوێ لە {name}: {preview}',
    },
    'review.helpful': {
      title: 'هەڵسەنگاندنەکەت بەسوود بوو',
      body: '{count} کەس هەڵسەنگاندنەکەت بەسوود دیتووە',
    },
    'follow.new': {
      title: 'شوێنکەوتنەوەی نوێ',
      body: '{name} دەستی بە شوێنکەوتنەوەت کرد',
    },
    'place.nearby': {
      title: 'شوێنی تایبەت نزیکتە',
      body: 'شوێنی تایبەت نزیکتە: {placeName}',
    },
    'incident.confirmed': {
      title: 'ئاگاداری ڕووداو',
      body: 'ڕووداوی {type} لەنزیک {street} دروستبووە',
    },
    'event.reminder': {
      title: 'بیرخستنەوەی ئیش',
      body: 'بیرخستنەوە: {eventName} بەیانی',
    },
    'review.response': {
      title: 'وەڵامی هەڵسەنگاندنەکەت',
      body: '{businessName} وەڵامی هەڵسەنگاندنەکەتی داوە',
    },
    'achievement.unlocked': {
      title: 'نیشانەی نوێ!',
      body: 'نیشانەی {badgeName}ت وەرگرت!',
    },
    'trending.place': {
      title: 'شوێنی ترێند',
      body: '{placeName} لە {city} ترێندە',
    },
  },

  en: {
    'message.new': {
      title: 'New message',
      body: 'New message from {name}: {preview}',
    },
    'review.helpful': {
      title: 'Your review was helpful',
      body: '{count} people found your review helpful',
    },
    'follow.new': {
      title: 'New follower',
      body: '{name} started following you',
    },
    'place.nearby': {
      title: 'Featured place nearby',
      body: 'Featured place nearby: {placeName}',
    },
    'incident.confirmed': {
      title: 'Incident alert',
      body: '{type} incident confirmed near {street}',
    },
    'event.reminder': {
      title: 'Event reminder',
      body: 'Reminder: {eventName} is tomorrow',
    },
    'review.response': {
      title: 'Response to your review',
      body: '{businessName} responded to your review',
    },
    'achievement.unlocked': {
      title: 'New achievement!',
      body: 'You unlocked the {badgeName} badge!',
    },
    'trending.place': {
      title: 'Trending place',
      body: '{placeName} is trending in {city}',
    },
  },
};

// ─── Interpolation ───────────────────────────────────────────────────────────

function interpolate(template: string, data: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = data[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a push notification title + body for the given template type,
 * interpolating `data` and rendering in the requested locale.
 * Falls back to Arabic when locale is unknown.
 */
export function renderNotification(
  type: NotificationTemplateType,
  data: Record<string, string | number>,
  locale: NotificationLocale = 'ar',
): NotificationContent {
  const localeStrings = STRINGS[locale] ?? STRINGS['ar'];
  const template = localeStrings[type];

  return {
    title: interpolate(template.title, data),
    body: interpolate(template.body, data),
  };
}

/**
 * Convenience: render for all three locales at once (useful for testing or
 * multi-locale pre-generation).
 */
export function renderNotificationAllLocales(
  type: NotificationTemplateType,
  data: Record<string, string | number>,
): Record<NotificationLocale, NotificationContent> {
  return {
    ar: renderNotification(type, data, 'ar'),
    ckb: renderNotification(type, data, 'ckb'),
    en: renderNotification(type, data, 'en'),
  };
}

/** Map a notification `type` string (from DB/API) to a NotificationTemplateType if valid. */
export function isTemplateType(type: string): type is NotificationTemplateType {
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
  return valid.includes(type as NotificationTemplateType);
}
