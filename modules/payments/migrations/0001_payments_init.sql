-- Migration: payments module initial schema
-- Creates the `payments` Postgres schema and all its tables.
-- Only touches the `payments.*` schema — never cross-schema joins.

CREATE SCHEMA IF NOT EXISTS payments;

-- ─── Wallets ──────────────────────────────────────────────────────────────────

CREATE TABLE payments.wallet (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL UNIQUE,
  -- IQD is stored as integer dinars (no decimal in Iraqi Dinar)
  balance_iqd    BIGINT      NOT NULL DEFAULT 0 CHECK (balance_iqd >= 0),
  held_iqd       BIGINT      NOT NULL DEFAULT 0 CHECK (held_iqd >= 0),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX wallet_user_id_idx ON payments.wallet (user_id);

-- ─── Transactions ─────────────────────────────────────────────────────────────

CREATE TABLE payments.transaction (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id           UUID        NOT NULL REFERENCES payments.wallet(id) ON DELETE RESTRICT,
  user_id             UUID        NOT NULL,
  type                TEXT        NOT NULL CHECK (type IN ('credit','debit','hold','release','refund')),
  status              TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','reversed')),
  amount_iqd          BIGINT      NOT NULL CHECK (amount_iqd > 0),
  balance_after_iqd   BIGINT      NOT NULL CHECK (balance_after_iqd >= 0),
  description         TEXT        NOT NULL DEFAULT '',
  payment_intent_id   UUID,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX transaction_wallet_id_created_idx ON payments.transaction (wallet_id, created_at DESC);
CREATE INDEX transaction_user_id_created_idx   ON payments.transaction (user_id, created_at DESC);
CREATE INDEX transaction_payment_intent_idx    ON payments.transaction (payment_intent_id) WHERE payment_intent_id IS NOT NULL;

-- ─── Payment methods ──────────────────────────────────────────────────────────

CREATE TABLE payments.payment_method (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL,
  type           TEXT        NOT NULL CHECK (type IN ('card','wallet','cash_on_delivery')),
  -- Card-specific fields (null for other types)
  card_last4     CHAR(4),
  card_brand     TEXT        CHECK (card_brand IN ('visa','mastercard','other')),
  card_expiry_month  SMALLINT CHECK (card_expiry_month BETWEEN 1 AND 12),
  card_expiry_year   SMALLINT CHECK (card_expiry_year >= 2024),
  card_holder_name   TEXT,
  is_default     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_method_user_id_idx ON payments.payment_method (user_id);

-- Only one default per user
CREATE UNIQUE INDEX payment_method_user_default_idx
  ON payments.payment_method (user_id)
  WHERE is_default = TRUE;

-- ─── Payment intents ──────────────────────────────────────────────────────────

CREATE TABLE payments.payment_intent (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL,
  amount              BIGINT      NOT NULL CHECK (amount > 0),
  currency            TEXT        NOT NULL DEFAULT 'IQD' CHECK (currency IN ('IQD','USD')),
  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','requires_confirmation','processing','succeeded','failed','refunded','partially_refunded','cancelled')),
  payment_method_id   UUID        REFERENCES payments.payment_method(id) ON DELETE SET NULL,
  description         TEXT        NOT NULL DEFAULT '',
  metadata            JSONB       NOT NULL DEFAULT '{}',
  flagged_for_review  BOOLEAN     NOT NULL DEFAULT FALSE,
  refunded_amount     BIGINT      NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_intent_user_id_status_idx ON payments.payment_intent (user_id, status);
CREATE INDEX payment_intent_created_at_idx     ON payments.payment_intent (created_at DESC);
CREATE INDEX payment_intent_expires_at_idx     ON payments.payment_intent (expires_at) WHERE status IN ('pending','requires_confirmation');

-- ─── Rate-limit buckets (sliding window counters) ─────────────────────────────

CREATE TABLE payments.rate_limit (
  user_id    UUID        NOT NULL,
  bucket     TEXT        NOT NULL,   -- e.g. 'payments:hourly'
  count      INT         NOT NULL DEFAULT 1,
  window_end TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, bucket)
);

CREATE INDEX rate_limit_window_end_idx ON payments.rate_limit (window_end);
