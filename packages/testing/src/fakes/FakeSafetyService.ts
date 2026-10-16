/**
 * FakeSafetyService — in-memory safety/incident service fake for testing.
 *
 * Covers:
 *  - createIncident, getIncident, listNear
 *  - confirmIncident, dismissIncident
 *  - subscribe / unsubscribe alerts
 *  - notifySubscribers (in-memory pub/sub)
 *  - SafetyIncident expiry
 *  - Geospatial radius filtering
 */
import { randomUUID } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IncidentType =
  | 'accident'
  | 'roadblock'
  | 'flood'
  | 'fire'
  | 'civil_unrest'
  | 'power_outage'
  | 'other';

export type IncidentStatus = 'pending' | 'confirmed' | 'dismissed';

export interface SafetyIncident {
  id: string;
  type: IncidentType;
  description: string | null;
  reportedBy: string | null;
  lat: number;
  lng: number;
  status: IncidentStatus;
  confirmedBy: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  active: boolean;
}

export interface CreateIncidentDto {
  type: IncidentType;
  lat: number;
  lng: number;
  description?: string;
  ttlHours?: number;
  reportedBy?: string;
}

export interface NearbyQuery {
  lat: number;
  lng: number;
  radiusKm: number;
  types?: IncidentType[];
  includeExpired?: boolean;
}

export interface AlertSubscription {
  userId: string;
  lat: number;
  lng: number;
  radiusKm: number;
  types?: IncidentType[];
  createdAt: Date;
}

export interface AlertNotification {
  subscriptionId: string;
  userId: string;
  incidentId: string;
  incidentType: IncidentType;
  lat: number;
  lng: number;
  description: string | null;
  sentAt: Date;
}

export class FakeSafetyServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'ALREADY_PROCESSED' | 'FORBIDDEN' | 'INVALID_LOCATION',
  ) {
    super(message);
    this.name = 'FakeSafetyServiceError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Haversine distance in km between two lat/lng points. */
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FakeSafetyService {
  private readonly incidents = new Map<string, SafetyIncident>();
  private readonly subscriptions = new Map<string, AlertSubscription>();

  /** All notifications dispatched (for test assertions). */
  readonly notifications: AlertNotification[] = [];

  // ── createIncident ──────────────────────────────────────────────────────────

  async createIncident(dto: CreateIncidentDto): Promise<SafetyIncident> {
    const now = new Date();
    const ttlMs = (dto.ttlHours ?? 2) * 3_600_000;
    const expiresAt = new Date(now.getTime() + ttlMs);
    const incident: SafetyIncident = {
      id: randomUUID(),
      type: dto.type,
      description: dto.description ?? null,
      reportedBy: dto.reportedBy ?? null,
      lat: dto.lat,
      lng: dto.lng,
      status: 'pending',
      confirmedBy: null,
      confirmedAt: null,
      createdAt: now,
      expiresAt,
      active: true,
    };
    this.incidents.set(incident.id, incident);
    await this.dispatchAlerts(incident);
    return incident;
  }

  // ── getIncident ─────────────────────────────────────────────────────────────

  async getIncident(id: string): Promise<SafetyIncident> {
    const incident = this.incidents.get(id);
    if (!incident) {
      throw new FakeSafetyServiceError(`SafetyIncident ${id} not found`, 'NOT_FOUND');
    }
    return { ...incident, active: incident.expiresAt > new Date() };
  }

  // ── listNear ────────────────────────────────────────────────────────────────

  async listNear(query: NearbyQuery): Promise<SafetyIncident[]> {
    const now = new Date();
    return [...this.incidents.values()]
      .filter((inc) => {
        if (!query.includeExpired && inc.expiresAt <= now) return false;
        if (inc.status === 'dismissed') return false;
        if (query.types && query.types.length > 0 && !query.types.includes(inc.type)) return false;
        const dist = distanceKm(query.lat, query.lng, inc.lat, inc.lng);
        return dist <= query.radiusKm;
      })
      .map((inc) => ({ ...inc, active: inc.expiresAt > now }));
  }

  // ── confirmIncident ─────────────────────────────────────────────────────────

  async confirmIncident(id: string, adminId: string): Promise<SafetyIncident> {
    const incident = await this.getIncident(id);
    if (incident.status !== 'pending') {
      throw new FakeSafetyServiceError(
        `SafetyIncident ${id} is already ${incident.status}`,
        'ALREADY_PROCESSED',
      );
    }
    const updated: SafetyIncident = {
      ...incident,
      status: 'confirmed',
      confirmedBy: adminId,
      confirmedAt: new Date(),
    };
    this.incidents.set(id, updated);
    return updated;
  }

  // ── dismissIncident ─────────────────────────────────────────────────────────

  async dismissIncident(id: string, adminId: string): Promise<SafetyIncident> {
    const incident = await this.getIncident(id);
    if (incident.status !== 'pending') {
      throw new FakeSafetyServiceError(
        `SafetyIncident ${id} is already ${incident.status}`,
        'ALREADY_PROCESSED',
      );
    }
    const updated: SafetyIncident = {
      ...incident,
      status: 'dismissed',
      confirmedBy: adminId,
      confirmedAt: new Date(),
    };
    this.incidents.set(id, updated);
    return updated;
  }

  // ── subscribe ───────────────────────────────────────────────────────────────

  async subscribe(
    userId: string,
    lat: number,
    lng: number,
    radiusKm: number,
    types?: IncidentType[],
  ): Promise<AlertSubscription> {
    const existing = this.getSubscription(userId);
    const sub: AlertSubscription = {
      userId,
      lat,
      lng,
      radiusKm,
      types,
      createdAt: existing?.createdAt ?? new Date(),
    };
    this.subscriptions.set(userId, sub);
    return sub;
  }

  // ── unsubscribe ─────────────────────────────────────────────────────────────

  async unsubscribe(userId: string): Promise<{ removed: boolean }> {
    const existed = this.subscriptions.has(userId);
    this.subscriptions.delete(userId);
    return { removed: existed };
  }

  // ── getSubscription ─────────────────────────────────────────────────────────

  getSubscription(userId: string): AlertSubscription | undefined {
    return this.subscriptions.get(userId);
  }

  // ── dispatchAlerts ──────────────────────────────────────────────────────────

  private async dispatchAlerts(incident: SafetyIncident): Promise<void> {
    for (const [, sub] of this.subscriptions) {
      const dist = distanceKm(sub.lat, sub.lng, incident.lat, incident.lng);
      if (dist > sub.radiusKm) continue;
      if (sub.types && sub.types.length > 0 && !sub.types.includes(incident.type)) continue;
      this.notifications.push({
        subscriptionId: sub.userId,
        userId: sub.userId,
        incidentId: incident.id,
        incidentType: incident.type,
        lat: incident.lat,
        lng: incident.lng,
        description: incident.description,
        sentAt: new Date(),
      });
    }
  }

  // ── listActiveIncidents ─────────────────────────────────────────────────────

  async listActive(): Promise<SafetyIncident[]> {
    const now = new Date();
    return [...this.incidents.values()]
      .filter((inc) => inc.expiresAt > now && inc.status !== 'dismissed')
      .map((inc) => ({ ...inc, active: true }));
  }

  // ── expireIncident (for testing) ────────────────────────────────────────────

  expireIncident(id: string): void {
    const incident = this.incidents.get(id);
    if (incident) {
      this.incidents.set(id, {
        ...incident,
        expiresAt: new Date(Date.now() - 1000),
        active: false,
      });
    }
  }

  // ── reset ───────────────────────────────────────────────────────────────────

  reset(): void {
    this.incidents.clear();
    this.subscriptions.clear();
    this.notifications.length = 0;
  }

  // ── Inspection helpers ──────────────────────────────────────────────────────

  incidentCount(): number {
    return this.incidents.size;
  }

  subscriptionCount(): number {
    return this.subscriptions.size;
  }

  notificationCount(): number {
    return this.notifications.length;
  }

  notificationsFor(userId: string): AlertNotification[] {
    return this.notifications.filter((n) => n.userId === userId);
  }

  allIncidents(): SafetyIncident[] {
    return [...this.incidents.values()];
  }
}
