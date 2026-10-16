-- Reputation module schema
CREATE SCHEMA IF NOT EXISTS reputation;

-- User reputation totals
CREATE TABLE reputation.user_reputation (
  user_id       UUID PRIMARY KEY,
  total_points  INTEGER NOT NULL DEFAULT 0,
  level         TEXT NOT NULL DEFAULT 'explorer',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_reputation_total_points_idx ON reputation.user_reputation (total_points DESC);
CREATE INDEX user_reputation_level_idx        ON reputation.user_reputation (level);

-- Points ledger: every award is a row
CREATE TABLE reputation.points_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  points      INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}',
  city        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX points_ledger_user_id_idx         ON reputation.points_ledger (user_id, created_at DESC);
CREATE INDEX points_ledger_reason_idx          ON reputation.points_ledger (reason);
CREATE INDEX points_ledger_city_idx            ON reputation.points_ledger (city) WHERE city IS NOT NULL;

-- Badges catalog
CREATE TABLE reputation.badge_definition (
  id          TEXT PRIMARY KEY,
  name_ar     TEXT NOT NULL,
  name_ckb    TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  description_ar  TEXT NOT NULL,
  description_ckb TEXT NOT NULL,
  description_en  TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  category    TEXT NOT NULL,  -- 'contribution' | 'social' | 'explorer' | 'safety' | 'special'
  threshold   INTEGER,        -- numeric threshold (nullable for logic-gated badges)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User earned badges
CREATE TABLE reputation.user_badge (
  user_id     UUID NOT NULL,
  badge_id    TEXT NOT NULL REFERENCES reputation.badge_definition (id),
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX user_badge_user_id_idx   ON reputation.user_badge (user_id, awarded_at DESC);
CREATE INDEX user_badge_badge_id_idx  ON reputation.user_badge (badge_id);

-- Seed badge definitions
INSERT INTO reputation.badge_definition
  (id, name_ar, name_ckb, name_en, description_ar, description_ckb, description_en, emoji, category, threshold, sort_order)
VALUES
  ('first_steps',       'الخطوات الأولى',    'هەنگاوە یەکەمەکان', 'First Steps',        'أول تسجيل حضور',                 'یەکەم ماوەنی حاضری',              'Your first check-in',                    '🗺️', 'explorer',     1,    10),
  ('reviewer',          'مُراجِع',           'پێداچوونەوەکار',    'Reviewer',           'كتابة 5 مراجعات',                '5 پێداچوونەوە بنووسە',             'Write 5 reviews',                        '⭐', 'contribution', 5,    20),
  ('top_reviewer',      'أفضل مُراجِع',      'باشترین پێداچوونەوەکار', 'Top Reviewer',  'كتابة 50 مراجعة',                '50 پێداچوونەوە بنووسە',            'Write 50 reviews',                       '🏆', 'contribution', 50,   30),
  ('safety_first',      'السلامة أولاً',      'سەلامەتی یەکەم',    'Safety First',       'الإبلاغ عن 10 حوادث',            '10 ڕووداوی ڕاپۆرت بکە',            'Report 10 incidents',                    '🚨', 'safety',       10,   40),
  ('explorer',          'مُستكشِف',          'گەڕەکەر',           'Explorer',           'زيارة 10 أماكن مختلفة',           'سەردانی 10 شوێنی جیاواز بکە',      'Visit 10 different places',              '📍', 'explorer',     10,   50),
  ('baghdad_pro',       'بغداد برو',         'پرۆفیسۆری بەغدا',  'Baghdad Pro',        '50 زيارة في بغداد',               '50 سەردانی بەغدا',                 '50 visits in Baghdad',                   '🏙️', 'explorer',     50,   60),
  ('photographer',      'مُصَوِّر',          'وێنەکێش',           'Photographer',       'رفع 20 صورة',                    '20 وێنە بارکە',                    'Upload 20 photos',                       '📷', 'contribution', 20,   70),
  ('conversationalist', 'المُحاوِر',         'قسەبێژ',            'Conversationalist',  'إرسال 100 رسالة',                '100 پەیام بنێرە',                  'Send 100 messages',                      '💬', 'social',       100,  80),
  ('community_pillar',  'ركيزة المجتمع',     'ستووری کۆمەڵگە',   'Community Pillar',   'استقبال 500 تصويت مفيد',          '500 دەنگی بەسوودت وەربگرە',        'Receive 500 helpful votes',              '🤝', 'social',       500,  90),
  ('local_expert',      'خبير محلي',         'پسپۆڕی خەڵکی',     'Local Expert',       'الوصول إلى المستوى 5',           'گەشتنە ئاستی 5',                  'Reach level 5',                          '🌟', 'special',      NULL, 100);
