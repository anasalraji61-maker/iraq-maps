/**
 * VerificationService — manages the provider verification workflow.
 *
 * Steps: submitted → reviewing → identity_verified → location_verified → approved | rejected
 *
 * All step transitions emit versioned domain events via the transactional outbox.
 */

import { randomUUID } from 'node:crypto';
import {
  type AdminProviderView,
  type ProviderId,
  type UserId,
} from '@iraq-maps/contracts';
import {
  createOutboxPublisher,
  writeAdminAuditLog,
  type Db,
} from '@iraq-maps/db-kit';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { auditLogTable, providerTable } from './schema';

// ─── Verification step enum ────────────────────────────────────────────────────

export type VerificationStep =
  | 'submitted'
  | 'reviewing'
  | 'identity_verified'
  | 'location_verified'
  | 'approved'
  | 'rejected';

export const STEP_ORDER: VerificationStep[] = [
  'submitted',
  'reviewing',
  'identity_verified',
  'location_verified',
  'approved',
];

// ─── Document types ────────────────────────────────────────────────────────────

export type VerificationDocType =
  | 'trade_license'
  | 'national_id'
  | 'lease_agreement'
  | 'health_certificate'
  | 'other';

// ─── Input types ───────────────────────────────────────────────────────────────

export interface SubmitVerificationInput {
  /** Optional URL to already-uploaded document — a cover upload; more via uploadVerificationDocument. */
  initialDocumentUrl?: string;
  initialDocumentType?: VerificationDocType;
  /** Free-text notes from the provider. */
  notes?: string;
}

export interface UpdateStepInput {
  step: VerificationStep;
  notes?: string;
}

export interface RequestAdditionalInfoInput {
  questions: string[];
}

export interface VerificationStatusResult {
  providerId: ProviderId;
  providerName: string;
  status: string;
  currentStep: VerificationStep;
  notes: string | null;
  submittedAt: string | null;
  documents: VerificationDocument[];
  audit: VerificationAuditEntry[];
}

export interface VerificationDocument {
  id: string;
  type: VerificationDocType;
  fileUrl: string;
  uploadedAt: string;
}

export interface VerificationAuditEntry {
  id: string;
  action: string;
  actorUserId: string;
  notes: string | null;
  at: string;
}

export interface VerificationQueueItem {
  providerId: ProviderId;
  providerName: string;
  category: string;
  submittedAt: string | null;
  currentStep: VerificationStep;
  waitingDays: number;
  documentsCount: number;
  priority: 'high' | 'normal' | 'low';
  ownerUserId: string;
  location: string | null;
}

export interface VerificationStats {
  totalPending: number;
  avgVerificationDays: number | null;
  approvalRatePercent: number | null;
  pendingByStep: Record<VerificationStep, number>;
}

// ─── In-memory document store (replaced by ObjectStorage port in production) ──

interface InMemoryDoc {
  id: string;
  providerId: string;
  type: VerificationDocType;
  fileUrl: string;
  uploadedAt: Date;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class VerificationService {
  private readonly outbox;
  /** In-memory document store — swap for ObjectStorage port. */
  private readonly docs: Map<string, InMemoryDoc[]> = new Map();

  constructor(
    @Inject('PROVIDERS_DB') private readonly db: Db,
  ) {
    this.outbox = createOutboxPublisher(db);
  }

  // ── Submit verification request ─────────────────────────────────────────────

  async submitVerificationRequest(
    providerId: ProviderId,
    input: SubmitVerificationInput,
  ): Promise<VerificationStatusResult> {
    const provider = await this.requireProvider(providerId);

    if (provider.status === 'pending') {
      throw new ConflictException({
        code: 'already_submitted',
        title: 'Verification request already submitted',
      });
    }
    if (provider.status === 'verified') {
      throw new ConflictException({
        code: 'already_verified',
        title: 'Provider is already verified',
      });
    }
    if (provider.status !== 'draft') {
      throw new ConflictException({
        code: 'invalid_status',
        title: `Cannot submit from status: ${provider.status}`,
      });
    }

    // Mark as pending and record submission
    await this.db
      .update(providerTable)
      .set({ status: 'pending', submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(providerTable.id, providerId));

    const auditId = randomUUID();
    await this.db.insert(auditLogTable).values({
      id: auditId,
      providerId,
      action: 'submitted',
      actorUserId: provider.userId,
      reason: input.notes ?? null,
    });

    // Store initial document if provided
    if (input.initialDocumentUrl && input.initialDocumentType) {
      this.addDocument(providerId, {
        type: input.initialDocumentType,
        fileUrl: input.initialDocumentUrl,
      });
    }

    // Emit event
    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.provider.submitted.v1',
      occurredAt: new Date().toISOString(),
      payload: { providerId },
    });

    return this.getVerificationStatus(providerId);
  }

  // ── Get verification status ─────────────────────────────────────────────────

  async getVerificationStatus(providerId: ProviderId): Promise<VerificationStatusResult> {
    const provider = await this.requireProvider(providerId);

    const audit = await this.db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.providerId, providerId))
      .orderBy(asc(auditLogTable.at));

    const currentStep = this.deriveCurrentStep(provider.status, audit);
    const latestNote = this.latestNoteFrom(audit);
    const docs = this.docs.get(providerId) ?? [];

    return {
      providerId,
      providerName: provider.name,
      status: provider.status,
      currentStep,
      notes: latestNote,
      submittedAt: provider.submittedAt?.toISOString() ?? null,
      documents: docs.map((d) => ({
        id: d.id,
        type: d.type,
        fileUrl: d.fileUrl,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
      audit: audit.map((a) => ({
        id: a.id,
        action: a.action,
        actorUserId: a.actorUserId,
        notes: a.reason,
        at: a.at?.toISOString() ?? new Date().toISOString(),
      })),
    };
  }

  // ── Update verification step (admin) ────────────────────────────────────────

  async updateVerificationStep(
    adminId: UserId,
    providerId: ProviderId,
    step: VerificationStep,
    notes?: string,
  ): Promise<VerificationStatusResult> {
    const provider = await this.requireProvider(providerId);

    if (provider.status !== 'pending') {
      throw new ConflictException({
        code: 'not_pending',
        title: 'Provider is not in pending status',
      });
    }

    if (step === 'approved' || step === 'rejected') {
      throw new BadRequestException({
        code: 'use_dedicated_method',
        title: 'Use approveVerification or rejectVerification for final decisions',
      });
    }

    // Validate step progression
    const currentAudit = await this.db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.providerId, providerId))
      .orderBy(asc(auditLogTable.createdAt));

    const currentStep = this.deriveCurrentStep(provider.status, currentAudit);
    const currentIdx = STEP_ORDER.indexOf(currentStep);
    const newIdx = STEP_ORDER.indexOf(step);

    if (newIdx <= currentIdx && step !== 'submitted') {
      throw new BadRequestException({
        code: 'step_regression',
        title: `Cannot move to step ${step}: already at or past ${currentStep}`,
      });
    }

    await this.db.insert(auditLogTable).values({
      id: randomUUID(),
      providerId,
      action: `step_${step}`,
      actorUserId: adminId,
      reason: notes ?? null,
    });

    // Emit step updated event
    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.verification.step_updated.v1',
      occurredAt: new Date().toISOString(),
      payload: { providerId, step, notes: notes ?? null },
    });

    return this.getVerificationStatus(providerId);
  }

  // ── Reject verification (admin) ─────────────────────────────────────────────

  async rejectVerification(
    adminId: UserId,
    providerId: ProviderId,
    reason: string,
  ): Promise<VerificationStatusResult> {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException({
        code: 'reason_required',
        title: 'A rejection reason of at least 5 characters is required',
      });
    }

    const provider = await this.requireProvider(providerId);

    if (provider.status === 'verified') {
      throw new ConflictException({
        code: 'already_verified',
        title: 'Cannot reject an already-verified provider',
      });
    }

    const [updated] = await this.db
      .update(providerTable)
      .set({ status: 'suspended', suspensionReason: reason.trim(), updatedAt: new Date() })
      .where(eq(providerTable.id, providerId))
      .returning();

    if (!updated) throw new NotFoundException({ code: 'not_found', title: 'Provider not found' });

    await this.db.insert(auditLogTable).values({
      id: randomUUID(),
      providerId,
      action: 'rejected',
      actorUserId: adminId,
      reason: reason.trim(),
    });

    await writeAdminAuditLog(this.db, {
      action: 'provider.rejected',
      actorUserId: adminId,
      targetId: providerId,
      reason: reason.trim(),
    });

    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.provider.suspended.v1',
      occurredAt: new Date().toISOString(),
      payload: { providerId },
    });

    return this.getVerificationStatus(providerId);
  }

  // ── Approve verification (admin) ────────────────────────────────────────────

  async approveVerification(
    adminId: UserId,
    providerId: ProviderId,
  ): Promise<VerificationStatusResult> {
    const provider = await this.requireProvider(providerId);

    if (provider.status === 'verified') {
      throw new ConflictException({
        code: 'already_verified',
        title: 'Provider is already verified',
      });
    }

    if (provider.status !== 'pending') {
      throw new ConflictException({
        code: 'not_pending',
        title: 'Provider must be pending to be approved',
      });
    }

    const [updated] = await this.db
      .update(providerTable)
      .set({ status: 'verified', suspensionReason: null, updatedAt: new Date() })
      .where(eq(providerTable.id, providerId))
      .returning();

    if (!updated) throw new NotFoundException({ code: 'not_found', title: 'Provider not found' });

    await this.db.insert(auditLogTable).values({
      id: randomUUID(),
      providerId,
      action: 'verified',
      actorUserId: adminId,
      reason: null,
    });

    await writeAdminAuditLog(this.db, {
      action: 'provider.verified',
      actorUserId: adminId,
      targetId: providerId,
      reason: null,
    });

    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.provider.verified.v1',
      occurredAt: new Date().toISOString(),
      payload: { providerId },
    });

    return this.getVerificationStatus(providerId);
  }

  // ── Request additional information (admin) ──────────────────────────────────

  async requestAdditionalInfo(
    adminId: UserId,
    providerId: ProviderId,
    input: RequestAdditionalInfoInput,
  ): Promise<VerificationStatusResult> {
    await this.requireProvider(providerId);

    if (!input.questions || input.questions.length === 0) {
      throw new BadRequestException({
        code: 'questions_required',
        title: 'At least one question is required',
      });
    }

    const questionsText = input.questions
      .filter((q) => q.trim().length > 0)
      .map((q, i) => `${i + 1}. ${q.trim()}`)
      .join('\n');

    await this.db.insert(auditLogTable).values({
      id: randomUUID(),
      providerId,
      action: 'info_requested',
      actorUserId: adminId,
      reason: questionsText,
    });

    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.verification.info_requested.v1',
      occurredAt: new Date().toISOString(),
      payload: {
        providerId,
        questions: input.questions,
        adminId,
      },
    });

    return this.getVerificationStatus(providerId);
  }

  // ── Upload verification document ────────────────────────────────────────────

  async uploadVerificationDocument(
    providerId: ProviderId,
    type: VerificationDocType,
    fileUrl: string,
  ): Promise<VerificationDocument> {
    await this.requireProvider(providerId);

    if (!fileUrl || !fileUrl.startsWith('https://')) {
      throw new BadRequestException({
        code: 'invalid_file_url',
        title: 'fileUrl must be a valid HTTPS URL returned by the media upload endpoint',
      });
    }

    const doc = this.addDocument(providerId, { type, fileUrl });

    await this.outbox.publish({
      id: randomUUID(),
      name: 'providers.verification.document_uploaded.v1',
      occurredAt: new Date().toISOString(),
      payload: { providerId, documentId: doc.id, type },
    });

    return {
      id: doc.id,
      type: doc.type,
      fileUrl: doc.fileUrl,
      uploadedAt: doc.uploadedAt.toISOString(),
    };
  }

  // ── Get verification queue (admin) ──────────────────────────────────────────

  async getVerificationQueue(
    cursor?: string,
    limit = 20,
  ): Promise<{ items: VerificationQueueItem[]; nextCursor: string | null }> {
    const rows = await this.db
      .select()
      .from(providerTable)
      .where(
        and(
          eq(providerTable.status, 'pending'),
          cursor
            ? lt(providerTable.submittedAt, new Date(cursor))
            : undefined,
        ),
      )
      .orderBy(asc(providerTable.submittedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row) =>
      this.toQueueItem(row),
    );

    const nextCursor =
      hasMore && items[items.length - 1]?.submittedAt
        ? items[items.length - 1]!.submittedAt
        : null;

    return { items, nextCursor };
  }

  // ── Get verification stats (admin) ──────────────────────────────────────────

  async getVerificationStats(): Promise<VerificationStats> {
    const [pendingRow] = await this.db
      .select({ total: count() })
      .from(providerTable)
      .where(eq(providerTable.status, 'pending'));

    const totalPending = pendingRow?.total ?? 0;

    // Average verification time: from submittedAt to the 'verified' audit entry
    const [avgRow] = await this.db.execute<{ avg_days: string | null }>(
      sql`
        SELECT AVG(EXTRACT(EPOCH FROM (al.created_at - p.submitted_at)) / 86400)::numeric(6,2) AS avg_days
        FROM providers.provider p
        JOIN providers.audit_log al ON al.provider_id = p.id AND al.action = 'verified'
        WHERE p.submitted_at IS NOT NULL
      `,
    );
    const avgDays = avgRow?.avg_days ? parseFloat(avgRow.avg_days) : null;

    // Approval rate
    const [approvalRow] = await this.db.execute<{
      total_decided: string;
      approved: string;
    }>(
      sql`
        SELECT
          COUNT(*) FILTER (WHERE action IN ('verified', 'rejected', 'suspended')) AS total_decided,
          COUNT(*) FILTER (WHERE action = 'verified') AS approved
        FROM providers.audit_log
        WHERE action IN ('verified', 'rejected', 'suspended')
      `,
    );
    const totalDecided = parseInt(approvalRow?.total_decided ?? '0', 10);
    const approved = parseInt(approvalRow?.approved ?? '0', 10);
    const approvalRate =
      totalDecided > 0 ? Math.round((approved / totalDecided) * 100) : null;

    // Pending counts by step are computed in memory from the pending queue
    // (real-time counters for small data sets)
    const pendingRows = await this.db
      .select()
      .from(providerTable)
      .where(eq(providerTable.status, 'pending'));

    const auditRows = await this.db
      .select()
      .from(auditLogTable)
      .where(
        sql`provider_id IN (${sql.raw(
          pendingRows.map((r) => `'${r.id}'`).join(',') || `'00000000-0000-0000-0000-000000000000'`,
        )})`,
      )
      .orderBy(asc(auditLogTable.at));

    const byStep: Record<string, number> = {};
    for (const row of pendingRows) {
      const rowAudit = auditRows.filter((a) => a.providerId === row.id);
      const step = this.deriveCurrentStep(row.status, rowAudit);
      byStep[step] = (byStep[step] ?? 0) + 1;
    }

    return {
      totalPending,
      avgVerificationDays: avgDays,
      approvalRatePercent: approvalRate,
      pendingByStep: {
        submitted: byStep['submitted'] ?? 0,
        reviewing: byStep['reviewing'] ?? 0,
        identity_verified: byStep['identity_verified'] ?? 0,
        location_verified: byStep['location_verified'] ?? 0,
        approved: byStep['approved'] ?? 0,
        rejected: byStep['rejected'] ?? 0,
      },
    };
  }

  // ── Bulk approve (admin convenience) ───────────────────────────────────────

  async bulkApprove(
    adminId: UserId,
    providerIds: ProviderId[],
  ): Promise<{ approved: number; failed: string[] }> {
    let approvedCount = 0;
    const failed: string[] = [];

    for (const id of providerIds) {
      try {
        await this.approveVerification(adminId, id);
        approvedCount++;
      } catch {
        failed.push(id);
      }
    }

    return { approved: approvedCount, failed };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async requireProvider(providerId: ProviderId) {
    const [row] = await this.db
      .select()
      .from(providerTable)
      .where(eq(providerTable.id, providerId))
      .limit(1);
    if (!row) {
      throw new NotFoundException({ code: 'provider_not_found', title: 'Provider not found' });
    }
    return row;
  }

  private deriveCurrentStep(
    status: string,
    audit: { action: string }[],
  ): VerificationStep {
    if (status === 'verified') return 'approved';
    if (status === 'suspended') return 'rejected';

    // Walk the audit log to find the latest step event
    const stepActions = audit
      .map((a) => a.action)
      .filter((a): a is `step_${VerificationStep}` => a.startsWith('step_'))
      .map((a): VerificationStep => a.slice('step_'.length) as VerificationStep);

    if (stepActions.length > 0) {
      return stepActions[stepActions.length - 1]!;
    }

    // Default: submitted (first state after draft → pending)
    if (status === 'pending') return 'submitted';
    return 'submitted';
  }

  private latestNoteFrom(audit: { action: string; reason: string | null }[]): string | null {
    const withNotes = [...audit]
      .reverse()
      .filter((a) => a.reason && a.action !== 'rejected');
    return withNotes[0]?.reason ?? null;
  }

  private addDocument(
    providerId: string,
    data: { type: VerificationDocType; fileUrl: string },
  ): InMemoryDoc {
    const doc: InMemoryDoc = {
      id: randomUUID(),
      providerId,
      type: data.type,
      fileUrl: data.fileUrl,
      uploadedAt: new Date(),
    };
    const list = this.docs.get(providerId) ?? [];
    list.push(doc);
    this.docs.set(providerId, list);
    return doc;
  }

  private toQueueItem(row: {
    id: string;
    name: string;
    category: string;
    submittedAt: Date | null;
    userId: string;
    location: string | null;
  }): VerificationQueueItem {
    const waitingMs = row.submittedAt
      ? Date.now() - row.submittedAt.getTime()
      : 0;
    const waitingDays = Math.floor(waitingMs / (1000 * 60 * 60 * 24));

    const docs = this.docs.get(row.id) ?? [];

    return {
      providerId: row.id as ProviderId,
      providerName: row.name,
      category: row.category,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      currentStep: 'submitted', // refined on demand via getVerificationStatus
      waitingDays,
      documentsCount: docs.length,
      priority: waitingDays >= 5 ? 'high' : waitingDays >= 2 ? 'normal' : 'low',
      ownerUserId: row.userId,
      location: row.location,
    };
  }
}

