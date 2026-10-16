/**
 * SafetyController – HTTP layer for the safety module.
 * Implements safetyContract via @ts-rest/nest.
 */
import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import {
  IRAQ_EMERGENCY_NUMBERS,
  type EmergencyAlertType,
  type SafetyAlertPrefs,
  type SafetyIncidentSeverity,
  type SafetyIncidentType,
  safetyContract,
} from '@iraq-maps/contracts';
import type { SafetyService } from './safety.service';
import type { EmergencyService } from './emergency.service';

export const SAFETY_SERVICE = Symbol('SAFETY_SERVICE');
export const EMERGENCY_SERVICE = Symbol('EMERGENCY_SERVICE');

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@Controller()
export class SafetyController {
  constructor(
    @Inject(SAFETY_SERVICE) private readonly safety: SafetyService,
    @Inject(EMERGENCY_SERVICE) private readonly emergency: EmergencyService,
  ) {}

  // ── Report incident ────────────────────────────────────────────────────────

  @TsRestHandler(safetyContract.reportIncident)
  async reportIncident() {
    return tsRestHandler(safetyContract.reportIncident, async ({ body, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      const [lng, lat] = body.location;
      const incident = await this.safety.reportSafetyIncident({
        type: body.type as SafetyIncidentType,
        severity: body.severity as SafetyIncidentSeverity,
        lng: lng!,
        lat: lat!,
        cityId: body.cityId,
        description: body.description,
        reportedBy: userId,
        ttlHours: body.ttlHours,
        anonymous: body.anonymous,
      });
      return { status: 201 as const, body: incident };
    });
  }

  // ── Get alerts ─────────────────────────────────────────────────────────────

  @TsRestHandler(safetyContract.getAlerts)
  async getAlerts() {
    return tsRestHandler(safetyContract.getAlerts, async ({ query }) => {
      const types = query.types
        ? (query.types.split(',').map((t) => t.trim()) as SafetyIncidentType[])
        : undefined;
      const result = await this.safety.getSafetyAlerts({
        lat: query.lat,
        lng: query.lng,
        radiusKm: query.radiusKm,
        cityId: query.cityId,
        severity: query.severity as SafetyIncidentSeverity | undefined,
        types,
      });
      return { status: 200 as const, body: result };
    });
  }

  // ── Get incident by id ─────────────────────────────────────────────────────

  @TsRestHandler(safetyContract.getIncidentById)
  async getIncidentById() {
    return tsRestHandler(safetyContract.getIncidentById, async ({ params }) => {
      const incident = await this.safety.getIncidentById(params.id);
      if (!incident) {
        return { status: 404 as const, body: { title: 'Not Found', status: 404, type: 'about:blank' } };
      }
      return { status: 200 as const, body: incident };
    });
  }

  // ── Update incident status ─────────────────────────────────────────────────

  @TsRestHandler(safetyContract.updateIncidentStatus)
  async updateIncidentStatus() {
    return tsRestHandler(safetyContract.updateIncidentStatus, async ({ params, body, headers: req }) => {
      const role = (req as { user?: { role?: string } }).user?.role;
      if (role !== 'moderator' && role !== 'admin') {
        return { status: 403 as const, body: { title: 'Forbidden', status: 403, type: 'about:blank' } };
      }
      const updated = await this.safety.updateIncidentStatus({
        id: params.id,
        status: body.status,
        adminNote: body.adminNote,
      });
      if (!updated) {
        return { status: 404 as const, body: { title: 'Not Found', status: 404, type: 'about:blank' } };
      }
      return { status: 200 as const, body: updated };
    });
  }

  // ── Alert subscriptions ────────────────────────────────────────────────────

  @TsRestHandler(safetyContract.subscribeSafetyAlerts)
  async subscribeSafetyAlerts() {
    return tsRestHandler(safetyContract.subscribeSafetyAlerts, async ({ body, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      const prefs: SafetyAlertPrefs = {
        cityId: body.cityId,
        enabledTypes: body.enabledTypes as SafetyIncidentType[],
        minSeverity: body.minSeverity as SafetyIncidentSeverity,
        radiusKm: body.radiusKm,
        pushEnabled: body.pushEnabled,
      };
      const saved = await this.safety.subscribeSafetyAlerts(userId, prefs);
      return { status: 200 as const, body: saved };
    });
  }

  @TsRestHandler(safetyContract.getSafetyAlertPrefs)
  async getSafetyAlertPrefs() {
    return tsRestHandler(safetyContract.getSafetyAlertPrefs, async ({ headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      const prefs = await this.safety.getSafetyAlertPrefs(userId);
      if (!prefs) {
        return { status: 404 as const, body: { title: 'Not Found', status: 404, type: 'about:blank' } };
      }
      return { status: 200 as const, body: prefs };
    });
  }

  // ── Trusted contacts ───────────────────────────────────────────────────────

  @TsRestHandler(safetyContract.getTrustedContacts)
  async getTrustedContacts() {
    return tsRestHandler(safetyContract.getTrustedContacts, async ({ headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      const contacts = await this.safety.getTrustedContacts(userId);
      return { status: 200 as const, body: contacts };
    });
  }

  @TsRestHandler(safetyContract.addTrustedContact)
  async addTrustedContact() {
    return tsRestHandler(safetyContract.addTrustedContact, async ({ body, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      try {
        const contact = await this.safety.addTrustedContact(userId, body.contactUserId);
        return { status: 201 as const, body: contact };
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ALREADY_TRUSTED_CONTACT') {
          return { status: 409 as const, body: { title: 'Already a contact', status: 409, code, type: 'about:blank' } };
        }
        if (code === 'SELF_CONTACT') {
          return { status: 400 as const, body: { title: 'Cannot add yourself', status: 400, code, type: 'about:blank' } };
        }
        throw err;
      }
    });
  }

  @TsRestHandler(safetyContract.removeTrustedContact)
  async removeTrustedContact() {
    return tsRestHandler(safetyContract.removeTrustedContact, async ({ params, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      await this.safety.removeTrustedContact(userId, params.contactId);
      return { status: 204 as const, body: undefined };
    });
  }

  // ── Location shares ────────────────────────────────────────────────────────

  @TsRestHandler(safetyContract.startLocationShare)
  async startLocationShare() {
    return tsRestHandler(safetyContract.startLocationShare, async ({ body, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      try {
        const share = await this.safety.startLocationShare({
          sharerId: userId,
          viewerIds: body.viewerIds as string[],
          durationMinutes: body.durationMinutes,
          emergencyTriggered: body.emergencyTriggered,
        });
        return { status: 201 as const, body: share };
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'VIEWER_NOT_TRUSTED_CONTACT') {
          return { status: 400 as const, body: { title: 'Viewer not a trusted contact', status: 400, code, type: 'about:blank' } };
        }
        throw err;
      }
    });
  }

  @TsRestHandler(safetyContract.updateLocationShare)
  async updateLocationShare() {
    return tsRestHandler(safetyContract.updateLocationShare, async ({ params, body, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      const [lng, lat] = body.location;
      const updated = await this.safety.updateLocationShare({
        shareId: params.shareId,
        sharerId: userId,
        lng: lng!,
        lat: lat!,
      });
      if (!updated) {
        return { status: 410 as const, body: { title: 'Share expired or not found', status: 410, type: 'about:blank' } };
      }
      return { status: 200 as const, body: updated };
    });
  }

  @TsRestHandler(safetyContract.stopLocationShare)
  async stopLocationShare() {
    return tsRestHandler(safetyContract.stopLocationShare, async ({ params, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      const deleted = await this.safety.stopLocationShare(params.shareId, userId);
      if (!deleted) {
        return { status: 404 as const, body: { title: 'Share not found', status: 404, type: 'about:blank' } };
      }
      return { status: 204 as const, body: undefined };
    });
  }

  @TsRestHandler(safetyContract.getLocationShare)
  async getLocationShare() {
    return tsRestHandler(safetyContract.getLocationShare, async ({ params, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      const share = await this.safety.getLocationShare(params.shareId, userId);
      if (!share) {
        return { status: 404 as const, body: { title: 'Share not found or expired', status: 404, type: 'about:blank' } };
      }
      return { status: 200 as const, body: share };
    });
  }

  @TsRestHandler(safetyContract.getActiveShares)
  async getActiveShares() {
    return tsRestHandler(safetyContract.getActiveShares, async ({ headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      const shares = await this.safety.getActiveShares(userId);
      return { status: 200 as const, body: shares };
    });
  }

  // ── Emergency alerts ───────────────────────────────────────────────────────

  @TsRestHandler(safetyContract.sendEmergencyAlert)
  async sendEmergencyAlert() {
    return tsRestHandler(safetyContract.sendEmergencyAlert, async ({ body, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      const [lng, lat] = body.location ?? [undefined, undefined];
      const alert = await this.emergency.sendEmergencyAlert({
        userId,
        type: body.type as EmergencyAlertType,
        lng,
        lat,
        message: body.message,
        startLocationShare: body.startLocationShare,
      });
      return { status: 201 as const, body: alert };
    });
  }

  @TsRestHandler(safetyContract.getEmergencyAlertHistory)
  async getEmergencyAlertHistory() {
    return tsRestHandler(safetyContract.getEmergencyAlertHistory, async ({ query, headers: req }) => {
      const userId = (req as { user?: { sub?: string } }).user?.sub;
      if (!userId) {
        return { status: 401 as const, body: { title: 'Unauthorized', status: 401, type: 'about:blank' } };
      }
      const { items: rawItems, nextCursor } = await this.safety.getEmergencyAlertHistory({
        userId,
        limit: query.limit,
        cursor: query.cursor,
      });

      const items = rawItems.map((r) => ({
        id: r.id as import('@iraq-maps/contracts').EmergencyAlertId,
        userId: r.user_id as import('@iraq-maps/contracts').UserId,
        type: r.type as EmergencyAlertType,
        location: (r.last_lng != null && r.last_lat != null
          ? [Number(r.last_lng), Number(r.last_lat)]
          : null) as [number, number] | null,
        message: r.message,
        sentAt: r.sent_at.toISOString(),
        notifiedContactIds: (r.notified_contact_ids ?? []) as import('@iraq-maps/contracts').UserId[],
        shareCreated: r.share_created,
        shareId: (r.share_id ?? null) as import('@iraq-maps/contracts').SafetyShareId | null,
      }));

      return { status: 200 as const, body: { items, nextCursor } };
    });
  }

  // ── Emergency numbers ──────────────────────────────────────────────────────

  @TsRestHandler(safetyContract.getEmergencyNumbers)
  async getEmergencyNumbers() {
    return tsRestHandler(safetyContract.getEmergencyNumbers, async () => {
      return { status: 200 as const, body: IRAQ_EMERGENCY_NUMBERS };
    });
  }
}
