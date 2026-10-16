-- Challenges module schema (schema: challenges)
-- Extended challenge types: review_count, place_visit, photo_upload,
-- incident_report, consecutive_login, category_explorer,
-- neighborhood_mapper, first_review.

CREATE SCHEMA IF NOT EXISTS challenges;

CREATE TABLE IF NOT EXISTS challenges.challenge (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL DEFAULT 'review_count',
  -- Localised titles
  title_ar        TEXT NOT NULL DEFAULT '',
  title_en        TEXT NOT NULL DEFAULT '',
  description_ar  TEXT NOT NULL DEFAULT '',
  description_en  TEXT NOT NULL DEFAULT '',
  difficulty      TEXT NOT NULL DEFAULT 'medium',  -- easy | medium | hard
  city_id         TEXT,                             -- NULL = global
  target          INTEGER NOT NULL DEFAULT 1,
  reward_points   INTEGER NOT NULL DEFAULT 0,
  reward_badge    TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ch_challenge_starts_at_idx  ON challenges.challenge(starts_at);
CREATE INDEX IF NOT EXISTS ch_challenge_ends_at_idx    ON challenges.challenge(ends_at);
CREATE INDEX IF NOT EXISTS ch_challenge_kind_idx       ON challenges.challenge(kind);
CREATE INDEX IF NOT EXISTS ch_challenge_city_id_idx    ON challenges.challenge(city_id);
CREATE INDEX IF NOT EXISTS ch_challenge_is_active_idx  ON challenges.challenge(is_active);
CREATE INDEX IF NOT EXISTS ch_challenge_is_featured_idx ON challenges.challenge(is_featured);

CREATE TABLE IF NOT EXISTS challenges.user_challenge (
  user_id           UUID NOT NULL,
  challenge_id      UUID NOT NULL REFERENCES challenges.challenge(id) ON DELETE CASCADE,
  progress          INTEGER NOT NULL DEFAULT 0,
  completed_at      TIMESTAMPTZ,
  reward_claimed_at TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS ch_user_challenge_challenge_idx  ON challenges.user_challenge(challenge_id);
CREATE INDEX IF NOT EXISTS ch_user_challenge_completed_idx  ON challenges.user_challenge(completed_at);
CREATE INDEX IF NOT EXISTS ch_user_challenge_progress_idx   ON challenges.user_challenge(challenge_id, progress DESC);
