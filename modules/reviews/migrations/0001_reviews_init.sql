-- Reviews module schema
CREATE SCHEMA IF NOT EXISTS reviews;

-- Main review table
CREATE TABLE reviews.review (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  place_id    UUID NOT NULL,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        TEXT NOT NULL DEFAULT '',
  photos_json JSONB NOT NULL DEFAULT '[]',
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  visit_date  DATE,
  status      TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'removed' | 'hidden'
  helpful_count    INTEGER NOT NULL DEFAULT 0,
  not_helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, place_id)
);

CREATE INDEX review_place_id_created_at_idx ON reviews.review (place_id, created_at DESC);
CREATE INDEX review_place_id_rating_idx     ON reviews.review (place_id, rating);
CREATE INDEX review_user_id_idx             ON reviews.review (user_id);
CREATE INDEX review_status_idx              ON reviews.review (status);

-- Helpful / not-helpful votes
CREATE TABLE reviews.review_vote (
  review_id  UUID NOT NULL REFERENCES reviews.review (id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  is_helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

CREATE INDEX review_vote_review_id_idx ON reviews.review_vote (review_id);

-- Reports for moderation
CREATE TABLE reviews.review_report (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL,
  review_id   UUID NOT NULL REFERENCES reviews.review (id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,  -- 'spam' | 'fake' | 'inappropriate' | 'other'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, review_id)
);

CREATE INDEX review_report_review_id_idx ON reviews.review_report (review_id);

-- Provider responses to reviews
CREATE TABLE reviews.review_response (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   UUID NOT NULL REFERENCES reviews.review (id) ON DELETE CASCADE,
  provider_id UUID NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id)
);

CREATE INDEX review_response_review_id_idx ON reviews.review_response (review_id);
