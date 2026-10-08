-- Schema `platform`: one transactional outbox shared by every module (written by createOutboxPublisher in the caller's tx).
CREATE TABLE platform.outbox (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id uuid NOT NULL UNIQUE,
  event jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX outbox_pending ON platform.outbox (seq) WHERE published_at IS NULL;
