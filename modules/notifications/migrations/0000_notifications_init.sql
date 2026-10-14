CREATE SCHEMA IF NOT EXISTS notifications;

CREATE TABLE notifications.device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android','ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE TABLE notifications.prefs (
  user_id uuid PRIMARY KEY,
  new_inquiry boolean NOT NULL DEFAULT true,
  reply_received boolean NOT NULL DEFAULT true,
  status_update boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
