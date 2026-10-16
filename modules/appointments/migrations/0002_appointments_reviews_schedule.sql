-- Migration: appointments module — reviews, schedule exceptions, blocked slots, capacity
-- Extends the initial schema with new tables for the full booking system.

-- ─── Appointment reviews ──────────────────────────────────────────────────────

CREATE TABLE appointments.appointment_review (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID        NOT NULL REFERENCES appointments.appointment(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL,
  provider_id     UUID        NOT NULL,
  rating          SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointment_review_appointment_unique UNIQUE (appointment_id)
);

CREATE INDEX appointment_review_provider_idx ON appointments.appointment_review (provider_id);

-- ─── Schedule exceptions ──────────────────────────────────────────────────────

CREATE TABLE appointments.schedule_exception (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID        NOT NULL,
  exception_date  DATE        NOT NULL,
  is_closed       BOOLEAN     NOT NULL DEFAULT TRUE,
  open_time       TIME,
  close_time      TIME,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_exception_provider_date_unique UNIQUE (provider_id, exception_date)
);

CREATE INDEX schedule_exception_provider_idx ON appointments.schedule_exception (provider_id);

-- ─── Blocked slots ────────────────────────────────────────────────────────────

CREATE TABLE appointments.blocked_slot (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID        NOT NULL,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX blocked_slot_provider_start_idx ON appointments.blocked_slot (provider_id, start_time);

-- ─── Provider schedule capacity ───────────────────────────────────────────────

CREATE TABLE appointments.provider_schedule_capacity (
  provider_id  UUID     NOT NULL,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  max_capacity SMALLINT NOT NULL DEFAULT 1 CHECK (max_capacity BETWEEN 1 AND 100),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, day_of_week)
);

-- ─── Status extensions ────────────────────────────────────────────────────────

-- Add 'arrived' and 'no_show' to the appointment status so we can track them
-- without losing the existing completed/cancelled semantics.
-- We use a TEXT column (already the case in 0001) so this is just a comment.
-- Allowed values after this migration: pending | confirmed | cancelled | completed | arrived | no_show
