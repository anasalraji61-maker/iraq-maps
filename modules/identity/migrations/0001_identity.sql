-- The phone is stored only as AES-256-GCM ciphertext (phone_enc) plus a keyed HMAC for lookup (phone_hash).
CREATE TABLE identity.users (
  id uuid PRIMARY KEY,
  phone_hash text NOT NULL UNIQUE,
  phone_enc text NOT NULL,
  name text,
  locale text NOT NULL CHECK (locale IN ('ar', 'ckb', 'en')),
  roles text[] NOT NULL DEFAULT '{user}' CHECK (roles <@ ARRAY['user', 'provider', 'moderator', 'admin']),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per refresh-token family. Only the token with the current generation may rotate;
-- presenting an older one (reuse) revokes the whole family.
CREATE TABLE identity.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users (id) ON DELETE CASCADE,
  generation integer NOT NULL DEFAULT 0,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_id_idx ON identity.sessions (user_id);
