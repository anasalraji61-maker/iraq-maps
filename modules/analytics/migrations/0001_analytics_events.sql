-- Analytics module: event tracking schema
-- All analytics data is in the `analytics` schema.
-- ODbL-free: no OSM-derived data here.

CREATE SCHEMA IF NOT EXISTS analytics;

-- Raw event table: every tracked action lands here.
CREATE TABLE IF NOT EXISTS analytics.event (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   TEXT NOT NULL,          -- e.g. 'app_open', 'search', 'route_calculated'
  user_id      UUID,                   -- nullable (pre-login events)
  session_id   TEXT,
  city_id      TEXT,
  properties   JSONB NOT NULL DEFAULT '{}',
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_event_type_idx      ON analytics.event (event_type);
CREATE INDEX IF NOT EXISTS analytics_event_user_idx      ON analytics.event (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_event_occurred_idx  ON analytics.event (occurred_at DESC);

-- Daily active users (pre-aggregated)
CREATE TABLE IF NOT EXISTS analytics.daily_active_users (
  date        DATE NOT NULL,
  user_count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date)
);

-- Retention: day-N users who returned
CREATE TABLE IF NOT EXISTS analytics.retention (
  cohort_date    DATE NOT NULL,
  day_offset     INTEGER NOT NULL,
  retained_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cohort_date, day_offset)
);
