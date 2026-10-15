-- Admin audit log: records every admin/moderator action that mutates user or content state.
CREATE TABLE identity.admin_audit_log (
  id          bigserial PRIMARY KEY,
  admin_id    uuid NOT NULL REFERENCES identity.users (id),
  action      text NOT NULL,   -- e.g. 'suspend_user', 'remove_post', 'approve_report', 'grant_role'
  target_id   text NOT NULL,   -- the affected entity's id (user id, post id, provider id …)
  target_type text NOT NULL,   -- discriminator: 'user', 'post', 'provider', 'report', …
  detail      jsonb,           -- optional extra context (reason, before/after fields, etc.)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_admin_id_idx  ON identity.admin_audit_log (admin_id);
CREATE INDEX admin_audit_log_target_idx    ON identity.admin_audit_log (target_type, target_id);
CREATE INDEX admin_audit_log_created_idx   ON identity.admin_audit_log (created_at DESC);
