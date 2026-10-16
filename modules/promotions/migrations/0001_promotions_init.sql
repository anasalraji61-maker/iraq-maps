-- Promotions module: initial schema (schema: promotions)
-- Provider-owned promotions and redemptions. Provider data is referenced only by UUID
-- so there is no cross-schema join and no ODbL contamination.

CREATE SCHEMA IF NOT EXISTS promotions;

-- ── Types ─────────────────────────────────────────────────────────────────────

CREATE TYPE promotions.promotion_type AS ENUM (
  'percentage_discount',
  'fixed_discount',
  'buy_one_get_one',
  'free_item',
  'happy_hour',
  'first_visit'
);

CREATE TYPE promotions.promotion_category AS ENUM (
  'food',
  'shopping',
  'services',
  'entertainment',
  'other'
);

-- ── Promotion ─────────────────────────────────────────────────────────────────

CREATE TABLE promotions.promotion (
  id                UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       UUID                          NOT NULL,
  city_id           TEXT                          NOT NULL,
  type              promotions.promotion_type     NOT NULL,
  category          promotions.promotion_category NOT NULL DEFAULT 'other',
  title_ar          TEXT                          NOT NULL CHECK (char_length(title_ar) BETWEEN 1 AND 200),
  title_en          TEXT                          CHECK (char_length(title_en) BETWEEN 1 AND 200),
  description_ar    TEXT                          CHECK (char_length(description_ar) <= 1000),
  description_en    TEXT                          CHECK (char_length(description_en) <= 1000),
  -- For percentage_discount: 0..100. For fixed_discount: IQD amount. Null for bogo/free.
  discount_value    NUMERIC(12, 2)                CHECK (discount_value IS NULL OR discount_value >= 0),
  -- Promo code for manual redemption. NULL = auto-applied.
  code              TEXT                          CHECK (char_length(code) <= 32),
  max_redemptions   INTEGER                       CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redeemed_count    INTEGER                       NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  valid_from        TIMESTAMPTZ                   NOT NULL,
  valid_to          TIMESTAMPTZ                   NOT NULL,
  -- Bitmask: Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64. 0 = every day.
  days_of_week      SMALLINT                      NOT NULL DEFAULT 0 CHECK (days_of_week BETWEEN 0 AND 127),
  -- 'HH:MM' in local time. NULL = all day.
  hours_from        TEXT                          CHECK (hours_from ~ '^\d{2}:\d{2}$'),
  hours_to          TEXT                          CHECK (hours_to   ~ '^\d{2}:\d{2}$'),
  is_active         BOOLEAN                       NOT NULL DEFAULT TRUE,
  is_featured       BOOLEAN                       NOT NULL DEFAULT FALSE,
  is_deleted        BOOLEAN                       NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_to_after_from CHECK (valid_to > valid_from)
);

CREATE INDEX ON promotions.promotion (provider_id) WHERE NOT is_deleted;
CREATE INDEX ON promotions.promotion (city_id, is_active, is_deleted, valid_to);
CREATE INDEX ON promotions.promotion (is_featured, city_id) WHERE is_active AND NOT is_deleted;

-- ── Redemption ────────────────────────────────────────────────────────────────

CREATE TABLE promotions.redemption (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL,
  promotion_id   UUID        NOT NULL REFERENCES promotions.promotion(id) ON DELETE CASCADE,
  redeemed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One redemption per user per promotion (first_visit type enforced here).
  CONSTRAINT unique_user_promotion UNIQUE (user_id, promotion_id)
);

CREATE INDEX ON promotions.redemption (promotion_id);
CREATE INDEX ON promotions.redemption (user_id);

-- Auto-increment redeemed_count on each new redemption.
CREATE OR REPLACE FUNCTION promotions.inc_redeemed_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE promotions.promotion
     SET redeemed_count = redeemed_count + 1,
         updated_at     = NOW()
   WHERE id = NEW.promotion_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inc_redeemed
  AFTER INSERT ON promotions.redemption
  FOR EACH ROW EXECUTE FUNCTION promotions.inc_redeemed_count();

-- Auto-deactivate promotions whose valid_to has passed (called by a scheduled job or on read).
CREATE OR REPLACE FUNCTION promotions.deactivate_expired()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE promotions.promotion
     SET is_active  = FALSE,
         updated_at = NOW()
   WHERE is_active = TRUE
     AND valid_to < NOW()
     AND NOT is_deleted;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
