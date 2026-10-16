-- Migration: provider_score table and score_history table
-- Module: providers schema

CREATE TABLE IF NOT EXISTS providers.provider_score (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         UUID NOT NULL REFERENCES providers.provider(id) ON DELETE CASCADE,
  overall             NUMERIC(5,2) NOT NULL DEFAULT 0,
  rating_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
  engagement_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
  completeness_score  NUMERIC(5,2) NOT NULL DEFAULT 0,
  activity_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provider_score_provider_unique UNIQUE (provider_id)
);

CREATE INDEX IF NOT EXISTS provider_score_overall_idx
  ON providers.provider_score (overall DESC);

CREATE INDEX IF NOT EXISTS provider_score_provider_id_idx
  ON providers.provider_score (provider_id);

CREATE INDEX IF NOT EXISTS provider_score_computed_at_idx
  ON providers.provider_score (computed_at);

-- History table: one row per provider per day, retained for 90 days
CREATE TABLE IF NOT EXISTS providers.provider_score_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         UUID NOT NULL REFERENCES providers.provider(id) ON DELETE CASCADE,
  overall             NUMERIC(5,2) NOT NULL,
  rating_score        NUMERIC(5,2) NOT NULL,
  engagement_score    NUMERIC(5,2) NOT NULL,
  completeness_score  NUMERIC(5,2) NOT NULL,
  activity_score      NUMERIC(5,2) NOT NULL,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_score_history_provider_date_idx
  ON providers.provider_score_history (provider_id, recorded_at DESC);
