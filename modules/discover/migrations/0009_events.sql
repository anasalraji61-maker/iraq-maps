-- Events system
CREATE TABLE IF NOT EXISTS discover.event (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  address      TEXT NOT NULL DEFAULT '',
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  max_attendees INTEGER,
  image_url    TEXT,
  category     TEXT NOT NULL DEFAULT 'other',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discover.event_rsvp (
  event_id   UUID NOT NULL REFERENCES discover.event(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_organizer_idx ON discover.event(organizer_id);
CREATE INDEX IF NOT EXISTS event_start_time_idx ON discover.event(start_time);
CREATE INDEX IF NOT EXISTS event_category_idx ON discover.event(category);
CREATE INDEX IF NOT EXISTS event_rsvp_user_idx ON discover.event_rsvp(user_id);

-- Challenges system
CREATE TABLE IF NOT EXISTS discover.challenge (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  type              TEXT NOT NULL DEFAULT 'checkin',
  target_count      INTEGER NOT NULL DEFAULT 1,
  reward            TEXT,
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discover.challenge_progress (
  challenge_id UUID NOT NULL REFERENCES discover.challenge(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  progress     INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS challenge_starts_at_idx ON discover.challenge(starts_at);
CREATE INDEX IF NOT EXISTS challenge_ends_at_idx ON discover.challenge(ends_at);
CREATE INDEX IF NOT EXISTS challenge_progress_challenge_idx ON discover.challenge_progress(challenge_id);

-- Marketplace listings
CREATE TABLE IF NOT EXISTS discover.listing (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID NOT NULL,
  seller_name TEXT NOT NULL DEFAULT '',
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency    CHAR(3) NOT NULL DEFAULT 'IQD',
  category    TEXT NOT NULL DEFAULT 'other',
  images      TEXT[] NOT NULL DEFAULT '{}',
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_seller_id_idx ON discover.listing(seller_id);
CREATE INDEX IF NOT EXISTS listing_category_idx ON discover.listing(category);
CREATE INDEX IF NOT EXISTS listing_status_created_idx ON discover.listing(status, created_at DESC);
