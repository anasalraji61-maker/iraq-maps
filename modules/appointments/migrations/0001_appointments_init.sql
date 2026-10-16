-- Migration: appointments module initial schema
-- Creates the `appointments` Postgres schema and all its tables.
-- Only touches the `appointments.*` schema — never cross-schema joins.

CREATE SCHEMA IF NOT EXISTS appointments;

-- ─── Provider availability ────────────────────────────────────────────────────

CREATE TABLE appointments.provider_availability (
  provider_id          UUID        NOT NULL,
  day_of_week          SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 6=Sat
  open_time            TIME        NOT NULL,
  close_time           TIME        NOT NULL,
  slot_duration_minutes SMALLINT   NOT NULL DEFAULT 30 CHECK (slot_duration_minutes IN (15,30,45,60,90,120)),
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider_id, day_of_week)
);

CREATE INDEX provider_availability_provider_idx ON appointments.provider_availability (provider_id);

-- ─── Appointment slots ────────────────────────────────────────────────────────

CREATE TABLE appointments.appointment_slot (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID        NOT NULL,
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX appointment_slot_provider_start_idx ON appointments.appointment_slot (provider_id, start_time);
CREATE INDEX appointment_slot_available_idx ON appointments.appointment_slot (provider_id, is_available, start_time)
  WHERE is_available = TRUE;

-- ─── Provider time-off ────────────────────────────────────────────────────────

CREATE TABLE appointments.provider_time_off (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID        NOT NULL,
  start_date   DATE        NOT NULL,
  end_date     DATE        NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX provider_time_off_provider_dates_idx ON appointments.provider_time_off (provider_id, start_date, end_date);

-- ─── Appointments ─────────────────────────────────────────────────────────────

CREATE TABLE appointments.appointment (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL,
  provider_id  UUID        NOT NULL,
  slot_id      UUID        REFERENCES appointments.appointment_slot(id) ON DELETE SET NULL,
  -- denormalised for fast queries without joining to slot
  scheduled_at TIMESTAMPTZ NOT NULL,
  end_at       TIMESTAMPTZ NOT NULL,
  service      TEXT        NOT NULL CHECK (length(service) BETWEEN 1 AND 200),
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','confirmed','cancelled','completed')),
  notes        TEXT        CHECK (length(notes) <= 500),
  cancel_reason TEXT       CHECK (length(cancel_reason) <= 500),
  cancelled_by TEXT        CHECK (cancelled_by IN ('user','provider')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX appointment_user_id_status_idx ON appointments.appointment (user_id, status);
CREATE INDEX appointment_provider_id_scheduled_idx ON appointments.appointment (provider_id, scheduled_at);
CREATE INDEX appointment_scheduled_at_idx ON appointments.appointment (scheduled_at);

-- ─── Outbox (events) ──────────────────────────────────────────────────────────

CREATE TABLE appointments.outbox (
  id           BIGSERIAL   PRIMARY KEY,
  event_type   TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  published    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX outbox_unpublished_idx ON appointments.outbox (published, created_at) WHERE published = FALSE;
