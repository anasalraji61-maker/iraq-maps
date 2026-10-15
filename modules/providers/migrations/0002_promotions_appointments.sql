-- M31: promotions and appointments tables
CREATE TYPE providers.promotion_status AS ENUM ('active', 'expired', 'deleted');

CREATE TABLE providers.promotion (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers.provider(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  discount_pct INTEGER CHECK (discount_pct BETWEEN 1 AND 100),
  valid_from  TIMESTAMPTZ NOT NULL,
  valid_to    TIMESTAMPTZ NOT NULL,
  conditions  TEXT,
  status      providers.promotion_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX promotion_provider_id_idx ON providers.promotion(provider_id);
CREATE INDEX promotion_valid_to_idx ON providers.promotion(valid_to);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE providers.appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');

CREATE TABLE providers.appointment (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers.provider(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  date        TEXT NOT NULL,  -- ISO YYYY-MM-DD
  time        TEXT NOT NULL,  -- HH:MM
  service     TEXT NOT NULL,
  status      providers.appointment_status NOT NULL DEFAULT 'pending',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX appointment_provider_id_idx ON providers.appointment(provider_id);
CREATE INDEX appointment_user_id_idx ON providers.appointment(user_id);
CREATE INDEX appointment_date_idx ON providers.appointment(date);
