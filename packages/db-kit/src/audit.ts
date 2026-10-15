import { sql } from 'drizzle-orm';
import type { Db } from './db';

/**
 * Writes one immutable row to identity.admin_audit_log.
 * Uses raw SQL to avoid importing the identity schema from db-kit (which would create a
 * cross-package dependency). Errors are swallowed so a logging failure never aborts the
 * primary operation — call with `.catch(() => undefined)` where needed.
 */
export async function writeAdminAuditLog(
  db: Db,
  adminId: string,
  action: string,
  targetId: string,
  targetType: string,
  detail?: Record<string, unknown> | null,
): Promise<void> {
  await db.execute(
    sql`INSERT INTO identity.admin_audit_log (admin_id, action, target_id, target_type, detail, created_at)
        VALUES (${adminId}::uuid, ${action}, ${targetId}, ${targetType}, ${detail ? JSON.stringify(detail) : null}::jsonb, now())`,
  );
}
