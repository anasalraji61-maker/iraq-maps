// Re-export from db-kit so identity consumers can use the typed wrapper without depending on db-kit directly.
// Internal identity admin actions (grant_role, rotate_admin_key) call writeAdminAuditLog from db-kit.
export { writeAdminAuditLog as writeAdminAudit } from '@iraq-maps/db-kit';

export type AdminAction =
  | 'suspend_user'
  | 'unsuspend_user'
  | 'grant_role'
  | 'revoke_role'
  | 'remove_post'
  | 'approve_report'
  | 'approve_provider'
  | 'suspend_provider'
  | 'rotate_admin_key';

export type TargetType = 'user' | 'post' | 'provider' | 'report' | 'system';
