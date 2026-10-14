CREATE SCHEMA IF NOT EXISTS messaging;

CREATE TABLE messaging.inquiry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  text text NOT NULL CHECK (char_length(text) <= 500),
  idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messaging.delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES messaging.inquiry(id),
  place_id text NOT NULL,
  channel text NOT NULL, -- 'in_app' | 'whatsapp' | 'handoff'
  status text NOT NULL DEFAULT 'queued',
  external_id text,
  handoff_url text,
  handoff_copy_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messaging.reply (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES messaging.delivery(id),
  from_provider boolean NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messaging.provider_opt_out (
  provider_id uuid PRIMARY KEY,
  opted_out_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON messaging.inquiry(user_id, created_at DESC);
CREATE INDEX ON messaging.delivery(inquiry_id);
CREATE INDEX ON messaging.delivery(place_id, status);
