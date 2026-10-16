/**
 * EmergencyService – orchestrates emergency alert dispatch.
 *
 * Responsibilities:
 *  1. Fetch the user's trusted contacts.
 *  2. Create an auto-location-share if requested.
 *  3. Record the alert via SafetyService.
 *  4. Send push notifications to each notified contact via PushSender.
 *
 * Iraq emergency numbers are provided as static reference data.
 * Calling emergency services is done client-side via `tel:` deep-links;
 * this service only stores the record and pushes in-app alerts.
 */
import type {
  EmergencyAlert,
  EmergencyAlertId,
  EmergencyAlertType,
  IraqEmergencyNumber,
  SafetyShareId,
  UserId,
} from '@iraq-maps/contracts';
import { IRAQ_EMERGENCY_NUMBERS } from '@iraq-maps/contracts';
import type { SafetyService } from './safety.service';

// ---------------------------------------------------------------------------
// Port: push notification sender
// The real adapter is injected at composition-root time; this interface keeps
// the emergency service decoupled from the concrete FCM adapter.
// ---------------------------------------------------------------------------

export interface EmergencyPushSender {
  sendToUser(userId: string, payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class EmergencyService {
  constructor(
    private readonly safety: SafetyService,
    private readonly pushSender: EmergencyPushSender,
  ) {}

  /**
   * Send an SOS/emergency alert to all trusted contacts.
   *
   * Steps:
   *  1. Fetch trusted contacts (accepted only).
   *  2. Optionally start a 60-minute location share.
   *  3. Push a notification to each contact.
   *  4. Persist the alert record.
   */
  async sendEmergencyAlert(opts: {
    userId: string;
    type: EmergencyAlertType;
    lng?: number;
    lat?: number;
    message?: string;
    startLocationShare?: boolean;
  }): Promise<EmergencyAlert> {
    const {
      userId,
      type,
      lng,
      lat,
      message,
      startLocationShare = true,
    } = opts;

    // 1. Fetch trusted contacts (accepted only)
    const allContacts = await this.safety.getTrustedContacts(userId);
    const acceptedContacts = allContacts.filter((c) => c.accepted);
    const contactIds = acceptedContacts.map((c) => c.contactUserId as string);

    // 2. Start location share if requested and location available
    let shareId: string | undefined;
    if (startLocationShare && contactIds.length > 0) {
      try {
        const share = await this.safety.startLocationShare({
          sharerId: userId,
          viewerIds: contactIds,
          durationMinutes: 60, // 1-hour share for emergencies
          emergencyTriggered: true,
        });
        shareId = share.shareId;

        // Push initial position if provided
        if (lng != null && lat != null) {
          await this.safety.updateLocationShare({
            shareId: share.shareId,
            sharerId: userId,
            lng,
            lat,
          });
        }
      } catch {
        // Location share failure should not block the SOS — continue
        shareId = undefined;
      }
    }

    // 3. Send push notifications in parallel (errors are swallowed per-contact)
    const notificationTitle = this._emergencyTitle(type);
    const notificationBody = message
      ? message.slice(0, 200)
      : this._defaultBody(type);

    await Promise.allSettled(
      contactIds.map((contactId) =>
        this.pushSender.sendToUser(contactId, {
          title: notificationTitle,
          body: notificationBody,
          data: {
            screen: 'safety_emergency',
            alertUserId: userId,
            alertType: type,
            ...(shareId ? { shareId } : {}),
          },
        }),
      ),
    );

    // 4. Persist the alert
    const record = await this.safety.recordEmergencyAlert({
      userId,
      type,
      lng,
      lat,
      message,
      notifiedContactIds: contactIds,
      shareId,
    });

    return {
      id: record.id as EmergencyAlertId,
      userId: record.userId as UserId,
      type: record.type as EmergencyAlertType,
      location: record.location,
      message: record.message,
      sentAt: record.sentAt,
      notifiedContactIds: record.notifiedContactIds as UserId[],
      shareCreated: record.shareCreated,
      shareId: (record.shareId ?? null) as SafetyShareId | null,
    };
  }

  /**
   * Return the static list of Iraq emergency phone numbers.
   * These are public reference data — no auth required.
   *
   * Actual dialling is performed client-side via `tel:` deep-link.
   * This method exists so the API can serve the numbers in the app's language
   * and add any future region-specific overrides.
   */
  getEmergencyNumbers(_cityId?: string): IraqEmergencyNumber[] {
    // Future: filter by city/region for Kurdistan-specific numbers, etc.
    return IRAQ_EMERGENCY_NUMBERS;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _emergencyTitle(type: EmergencyAlertType): string {
    const titles: Record<EmergencyAlertType, string> = {
      sos:      'نداء استغاثة طارئ',
      medical:  'طارئ طبي',
      fire:     'حريق',
      security: 'تنبيه أمني',
      accident: 'حادث',
      other:    'تنبيه طارئ',
    };
    return titles[type] ?? 'تنبيه طارئ';
  }

  private _defaultBody(type: EmergencyAlertType): string {
    const bodies: Record<EmergencyAlertType, string> = {
      sos:      'أرسل جهة اتصال موثوقة طلب استغاثة. يرجى التحقق منها فوراً.',
      medical:  'أرسل جهة اتصال موثوقة تنبيهاً طبياً طارئاً.',
      fire:     'أرسل جهة اتصال موثوقة تنبيه حريق.',
      security: 'أرسل جهة اتصال موثوقة تنبيهاً أمنياً.',
      accident: 'أرسل جهة اتصال موثوقة تنبيه حادث.',
      other:    'أرسل جهة اتصال موثوقة تنبيهاً طارئاً.',
    };
    return bodies[type] ?? 'تنبيه طارئ من جهة اتصال موثوقة.';
  }
}
