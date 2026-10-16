/**
 * safety contract – safety incidents, trusted contacts, location sharing,
 * and emergency alerts for Iraq Smart Maps.
 *
 * Module: modules/safety (separate schema `safety.*`)
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { LngLat, Problem, UserId, paginated } from './common';

const c = initContract();

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

export const SafetyIncidentId = z.string().uuid().brand<'SafetyIncidentId'>();
export type SafetyIncidentId = z.infer<typeof SafetyIncidentId>;

export const TrustedContactId = z.string().uuid().brand<'TrustedContactId'>();
export type TrustedContactId = z.infer<typeof TrustedContactId>;

export const SafetyShareId = z.string().uuid().brand<'SafetyShareId'>();
export type SafetyShareId = z.infer<typeof SafetyShareId>;

export const EmergencyAlertId = z.string().uuid().brand<'EmergencyAlertId'>();
export type EmergencyAlertId = z.infer<typeof EmergencyAlertId>;

// ---------------------------------------------------------------------------
// Safety incident domain types
// ---------------------------------------------------------------------------

export const SafetyIncidentType = z.enum([
  'unsafe_area',
  'checkpoint',
  'flooding',
  'fire',
  'explosion',
  'armed_conflict',
  'civil_unrest',
  'kidnapping_risk',
  'theft',
  'road_danger',
  'medical_emergency',
  'natural_disaster',
  'curfew',
  'other',
]);
export type SafetyIncidentType = z.infer<typeof SafetyIncidentType>;

export const SafetyIncidentSeverity = z.enum(['low', 'medium', 'high', 'critical']);
export type SafetyIncidentSeverity = z.infer<typeof SafetyIncidentSeverity>;

export const SafetyIncidentStatus = z.enum(['active', 'confirmed', 'dismissed', 'expired']);
export type SafetyIncidentStatus = z.infer<typeof SafetyIncidentStatus>;

export const SafetyIncident = z.object({
  id: SafetyIncidentId,
  type: SafetyIncidentType,
  severity: SafetyIncidentSeverity,
  status: SafetyIncidentStatus,
  location: LngLat,
  cityId: z.string(),
  description: z.string().max(1000).nullable(),
  reportedBy: UserId.nullable(),
  anonymous: z.boolean(),
  confirmedCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  active: z.boolean(),
});
export type SafetyIncident = z.infer<typeof SafetyIncident>;

export const CreateSafetyIncidentRequest = z.object({
  type: SafetyIncidentType,
  severity: SafetyIncidentSeverity.default('medium'),
  location: LngLat,
  cityId: z.string().default('baghdad'),
  description: z.string().max(1000).optional(),
  /** Hours until auto-expiry (default 4, max 72). */
  ttlHours: z.number().int().min(1).max(72).default(4),
  anonymous: z.boolean().default(false),
});
export type CreateSafetyIncidentRequest = z.infer<typeof CreateSafetyIncidentRequest>;

export const UpdateSafetyIncidentStatusRequest = z.object({
  status: z.enum(['confirmed', 'dismissed']),
  adminNote: z.string().max(500).optional(),
});
export type UpdateSafetyIncidentStatusRequest = z.infer<typeof UpdateSafetyIncidentStatusRequest>;

// ---------------------------------------------------------------------------
// Safety alert subscription
// ---------------------------------------------------------------------------

export const SafetyAlertPrefs = z.object({
  cityId: z.string(),
  enabledTypes: z.array(SafetyIncidentType).default([]),
  minSeverity: SafetyIncidentSeverity.default('medium'),
  radiusKm: z.number().min(1).max(100).default(20),
  pushEnabled: z.boolean().default(true),
});
export type SafetyAlertPrefs = z.infer<typeof SafetyAlertPrefs>;

// ---------------------------------------------------------------------------
// Trusted contacts
// ---------------------------------------------------------------------------

export const TrustedContact = z.object({
  id: TrustedContactId,
  userId: UserId,
  contactUserId: UserId,
  /** Display name of the contact (from their profile). */
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  /** Whether the contact has accepted the trusted-contact invitation. */
  accepted: z.boolean(),
  addedAt: z.string().datetime(),
});
export type TrustedContact = z.infer<typeof TrustedContact>;

export const AddTrustedContactRequest = z.object({
  contactUserId: UserId,
  /** Explicit consent: the user acknowledges they will share location/emergencies with this contact. */
  consentAcknowledged: z.literal(true),
});
export type AddTrustedContactRequest = z.infer<typeof AddTrustedContactRequest>;

// ---------------------------------------------------------------------------
// Live location share (safety-scoped — separate from the public location-share)
// ---------------------------------------------------------------------------

export const SafetyLocationShare = z.object({
  shareId: SafetyShareId,
  sharerId: UserId,
  viewerIds: z.array(UserId),
  /** null until the sharer sends the first position update */
  location: LngLat.nullable(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Whether this share was triggered by an emergency alert. */
  emergencyTriggered: z.boolean(),
});
export type SafetyLocationShare = z.infer<typeof SafetyLocationShare>;

export const CreateSafetyShareRequest = z.object({
  /** Viewer user IDs (must all be trusted contacts of the sharer). */
  viewerIds: z.array(UserId).min(1).max(20),
  /** Duration in minutes (default 30, max 1440 = 24 h). */
  durationMinutes: z.number().int().min(1).max(1440).default(30),
  emergencyTriggered: z.boolean().default(false),
});
export type CreateSafetyShareRequest = z.infer<typeof CreateSafetyShareRequest>;

export const UpdateSafetyLocationRequest = z.object({
  location: LngLat,
});
export type UpdateSafetyLocationRequest = z.infer<typeof UpdateSafetyLocationRequest>;

// ---------------------------------------------------------------------------
// Emergency alert
// ---------------------------------------------------------------------------

export const EmergencyAlertType = z.enum([
  'sos',
  'medical',
  'fire',
  'security',
  'accident',
  'other',
]);
export type EmergencyAlertType = z.infer<typeof EmergencyAlertType>;

export const EmergencyAlert = z.object({
  id: EmergencyAlertId,
  userId: UserId,
  type: EmergencyAlertType,
  location: LngLat.nullable(),
  message: z.string().max(500).nullable(),
  sentAt: z.string().datetime(),
  /** User IDs of trusted contacts who received the alert. */
  notifiedContactIds: z.array(UserId),
  /** Whether a location-share was auto-created for this alert. */
  shareCreated: z.boolean(),
  shareId: SafetyShareId.nullable(),
});
export type EmergencyAlert = z.infer<typeof EmergencyAlert>;

export const SendEmergencyAlertRequest = z.object({
  type: EmergencyAlertType.default('sos'),
  location: LngLat.optional(),
  message: z.string().max(500).optional(),
  /** Auto-start location sharing for 60 minutes. */
  startLocationShare: z.boolean().default(true),
});
export type SendEmergencyAlertRequest = z.infer<typeof SendEmergencyAlertRequest>;

// ---------------------------------------------------------------------------
// Iraq emergency numbers (static reference, returned by API)
// ---------------------------------------------------------------------------

export const IraqEmergencyNumber = z.object({
  service: z.string(),
  number: z.string(),
  description: z.string(),
});
export type IraqEmergencyNumber = z.infer<typeof IraqEmergencyNumber>;

export const IRAQ_EMERGENCY_NUMBERS: IraqEmergencyNumber[] = [
  { service: 'police',         number: '104', description: 'الشرطة' },
  { service: 'fire',           number: '115', description: 'الإطفاء والدفاع المدني' },
  { service: 'ambulance',      number: '122', description: 'الإسعاف' },
  { service: 'civil_defense',  number: '115', description: 'الدفاع المدني' },
  { service: 'electricity',    number: '108', description: 'طوارئ الكهرباء' },
  { service: 'water',          number: '118', description: 'طوارئ الماء' },
];

// ---------------------------------------------------------------------------
// REST contract
// ---------------------------------------------------------------------------

export const safetyContract = c.router({
  // ── Incidents ──────────────────────────────────────────────────────────────
  reportIncident: {
    method: 'POST',
    path: '/v1/safety/incidents',
    body: CreateSafetyIncidentRequest,
    responses: {
      201: SafetyIncident,
      400: Problem,
      401: Problem,
    },
  },

  getAlerts: {
    method: 'GET',
    path: '/v1/safety/incidents',
    query: z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radiusKm: z.coerce.number().min(0.1).max(100).default(20),
      cityId: z.string().optional(),
      severity: SafetyIncidentSeverity.optional(),
      types: z.string().optional(), // comma-separated SafetyIncidentType values
    }),
    responses: {
      200: paginated(SafetyIncident),
      400: Problem,
    },
  },

  getIncidentById: {
    method: 'GET',
    path: '/v1/safety/incidents/:id',
    pathParams: z.object({ id: SafetyIncidentId }),
    responses: {
      200: SafetyIncident,
      404: Problem,
    },
  },

  updateIncidentStatus: {
    method: 'PATCH',
    path: '/v1/safety/incidents/:id/status',
    pathParams: z.object({ id: SafetyIncidentId }),
    body: UpdateSafetyIncidentStatusRequest,
    responses: {
      200: SafetyIncident,
      400: Problem,
      401: Problem,
      403: Problem,
      404: Problem,
    },
  },

  // ── Alert subscriptions ────────────────────────────────────────────────────
  subscribeSafetyAlerts: {
    method: 'PUT',
    path: '/v1/safety/subscriptions/me',
    body: SafetyAlertPrefs,
    responses: {
      200: SafetyAlertPrefs,
      400: Problem,
      401: Problem,
    },
  },

  getSafetyAlertPrefs: {
    method: 'GET',
    path: '/v1/safety/subscriptions/me',
    responses: {
      200: SafetyAlertPrefs,
      401: Problem,
      404: Problem,
    },
  },

  // ── Trusted contacts ───────────────────────────────────────────────────────
  getTrustedContacts: {
    method: 'GET',
    path: '/v1/safety/contacts',
    responses: {
      200: z.array(TrustedContact),
      401: Problem,
    },
  },

  addTrustedContact: {
    method: 'POST',
    path: '/v1/safety/contacts',
    body: AddTrustedContactRequest,
    responses: {
      201: TrustedContact,
      400: Problem,
      401: Problem,
      409: Problem, // already a contact
    },
  },

  removeTrustedContact: {
    method: 'DELETE',
    path: '/v1/safety/contacts/:contactId',
    pathParams: z.object({ contactId: TrustedContactId }),
    responses: {
      204: z.undefined(),
      401: Problem,
      404: Problem,
    },
  },

  // ── Live location share ────────────────────────────────────────────────────
  startLocationShare: {
    method: 'POST',
    path: '/v1/safety/location-shares',
    body: CreateSafetyShareRequest,
    responses: {
      201: SafetyLocationShare,
      400: Problem,
      401: Problem,
    },
  },

  updateLocationShare: {
    method: 'PUT',
    path: '/v1/safety/location-shares/:shareId',
    pathParams: z.object({ shareId: SafetyShareId }),
    body: UpdateSafetyLocationRequest,
    responses: {
      200: SafetyLocationShare,
      401: Problem,
      403: Problem,
      404: Problem,
      410: Problem,
    },
  },

  stopLocationShare: {
    method: 'DELETE',
    path: '/v1/safety/location-shares/:shareId',
    pathParams: z.object({ shareId: SafetyShareId }),
    responses: {
      204: z.undefined(),
      401: Problem,
      403: Problem,
      404: Problem,
    },
  },

  getLocationShare: {
    method: 'GET',
    path: '/v1/safety/location-shares/:shareId',
    pathParams: z.object({ shareId: SafetyShareId }),
    responses: {
      200: SafetyLocationShare,
      401: Problem,
      403: Problem,
      404: Problem,
      410: Problem,
    },
  },

  getActiveShares: {
    method: 'GET',
    path: '/v1/safety/location-shares',
    responses: {
      200: z.array(SafetyLocationShare),
      401: Problem,
    },
  },

  // ── Emergency alert ────────────────────────────────────────────────────────
  sendEmergencyAlert: {
    method: 'POST',
    path: '/v1/safety/emergency-alerts',
    body: SendEmergencyAlertRequest,
    responses: {
      201: EmergencyAlert,
      400: Problem,
      401: Problem,
    },
  },

  getEmergencyAlertHistory: {
    method: 'GET',
    path: '/v1/safety/emergency-alerts',
    query: z.object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z.string().optional(),
    }),
    responses: {
      200: paginated(EmergencyAlert),
      401: Problem,
    },
  },

  // ── Emergency numbers (static, no auth) ───────────────────────────────────
  getEmergencyNumbers: {
    method: 'GET',
    path: '/v1/safety/emergency-numbers',
    responses: {
      200: z.array(IraqEmergencyNumber),
    },
  },
});
