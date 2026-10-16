-- User preferences: one JSON blob per user for app personalisation (theme, map style, nav settings, …).
-- Foreign-keyed to identity.users; deleted automatically when the user is deleted.
CREATE TABLE identity.user_preferences (
  user_id   uuid PRIMARY KEY REFERENCES identity.users (id) ON DELETE CASCADE,
  prefs     jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
