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

CREATE TABLE notifications.notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_notification_user_unread ON notifications.notification (user_id, created_at DESC) WHERE read_at IS NULL;
