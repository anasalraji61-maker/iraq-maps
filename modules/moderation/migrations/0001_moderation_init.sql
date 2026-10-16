-- Moderation module schema
-- Schema: moderation

CREATE SCHEMA IF NOT EXISTS moderation;

-- Banned word filter per locale
CREATE TABLE moderation.word_filter (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word       TEXT NOT NULL,
  locale     TEXT NOT NULL DEFAULT 'ar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(word, locale)
);
CREATE INDEX word_filter_locale_idx ON moderation.word_filter(locale);

-- Generic content reports (any content type)
CREATE TABLE moderation.report (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL,
  content_id   UUID NOT NULL,
  content_type TEXT NOT NULL,  -- 'post' | 'comment' | 'listing' | 'story' | 'user'
  reason       TEXT NOT NULL,  -- 'spam' | 'inappropriate' | 'violence' | 'hate_speech' | 'misinformation' | 'copyright' | 'other'
  details      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'removed' | 'warned' | 'suspended' | 'banned' | 'dismissed'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX report_status_created_idx ON moderation.report(status, created_at);
CREATE INDEX report_content_idx ON moderation.report(content_id, content_type);
CREATE INDEX report_reporter_idx ON moderation.report(reporter_id);

-- Log of moderator actions on reports
CREATE TABLE moderation.action (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID NOT NULL REFERENCES moderation.report(id) ON DELETE CASCADE,
  moderator_id UUID NOT NULL,
  action       TEXT NOT NULL,  -- 'approve' | 'remove' | 'warn' | 'suspend' | 'ban' | 'dismiss'
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX action_report_id_idx ON moderation.action(report_id);
CREATE INDEX action_moderator_id_idx ON moderation.action(moderator_id);

-- Warnings issued to users
CREATE TABLE moderation.user_warning (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  reason       TEXT NOT NULL,
  moderator_id UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ
);
CREATE INDEX user_warning_user_id_idx ON moderation.user_warning(user_id);

-- User suspensions / bans (separate from reports for direct admin action)
CREATE TABLE moderation.user_suspension (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE,
  type         TEXT NOT NULL,  -- 'suspend' | 'ban'
  reason       TEXT NOT NULL,
  moderator_id UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ  -- NULL = permanent ban
);
CREATE INDEX user_suspension_user_id_idx ON moderation.user_suspension(user_id);
CREATE INDEX user_suspension_expires_idx ON moderation.user_suspension(expires_at);
