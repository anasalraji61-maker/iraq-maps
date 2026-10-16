/**
 * User preference storage — read/write the JSON blob for a user's app settings.
 * Keeps one row in identity.user_preferences (upsert on write).
 */
import { type UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { userPreferences } from './schema';

// ─── schema ───────────────────────────────────────────────────────────────────
// All fields are optional so a partial update never wipes unrelated prefs.

export const AppearancePrefsSchema = z.object({
  theme:        z.enum(['system', 'light', 'dark']).optional(),
  fontSize:     z.enum(['small', 'normal', 'large', 'xlarge']).optional(),
  numberFormat: z.enum(['arabic-indic', 'western']).optional(),
  mapLanguage:  z.enum(['ar', 'en']).optional(),
  dateFormat:   z.enum(['arabic', 'gregorian']).optional(),
});

export const MapSettingsSchema = z.object({
  mapStyle:             z.enum(['street', 'satellite', 'terrain']).optional(),
  defaultCity:          z.enum(['baghdad', 'erbil', 'basra', 'mosul', 'other']).optional(),
  distanceUnit:         z.enum(['km', 'mi']).optional(),
  showTraffic:          z.boolean().optional(),
  showPlaces:           z.boolean().optional(),
  defaultZoom:          z.union([z.literal(10), z.literal(12), z.literal(14), z.literal(16)]).optional(),
  autoFollowLocation:   z.boolean().optional(),
  compassAlwaysVisible: z.boolean().optional(),
});

export const NavigationSettingsSchema = z.object({
  transportMode:    z.enum(['driving', 'walking', 'cycling']).optional(),
  avoidTolls:       z.boolean().optional(),
  avoidHighways:    z.boolean().optional(),
  avoidFerries:     z.boolean().optional(),
  speedLimitAlerts: z.boolean().optional(),
  speedLimitSound:  z.boolean().optional(),
  laneGuidance:     z.boolean().optional(),
  nightMode:        z.enum(['auto', 'always', 'never']).optional(),
  voiceLocale:      z.enum(['ar', 'ckb', 'en']).optional(),
  voiceVolume:      z.enum(['off', 'low', 'medium', 'high']).optional(),
  keepScreenOn:     z.boolean().optional(),
});

export const NotificationSettingsSchema = z.object({
  newInquiry:       z.boolean().optional(),
  replyReceived:    z.boolean().optional(),
  statusUpdate:     z.boolean().optional(),
  discoverLikes:    z.boolean().optional(),
  discoverComments: z.boolean().optional(),
  messages:         z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart:   z.string().optional(),  // "HH:mm"
  quietHoursEnd:     z.string().optional(),  // "HH:mm"
});

export const UserPrefsSchema = z.object({
  appearance:   AppearancePrefsSchema.optional(),
  map:          MapSettingsSchema.optional(),
  navigation:   NavigationSettingsSchema.optional(),
  notification: NotificationSettingsSchema.optional(),
});

export type UserPrefs = z.infer<typeof UserPrefsSchema>;

// ─── service ──────────────────────────────────────────────────────────────────
export class UserPreferencesService {
  constructor(private readonly db: Db) {}

  /** Returns the stored preferences, or an empty object if none exist yet. */
  async get(userId: UserId): Promise<UserPrefs> {
    const [row] = await this.db
      .select({ prefs: userPreferences.prefs })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    if (!row) return {};
    const parsed = UserPrefsSchema.safeParse(row.prefs);
    return parsed.success ? parsed.data : {};
  }

  /**
   * Deep-merges `patch` into the stored preferences and persists.
   * Creates the row if it doesn't exist yet (upsert).
   * Returns the full updated preferences.
   */
  async update(userId: UserId, patch: UserPrefs): Promise<UserPrefs> {
    const current = await this.get(userId);
    const merged: UserPrefs = {
      appearance:   patch.appearance   ? { ...current.appearance,   ...patch.appearance }   : current.appearance,
      map:          patch.map          ? { ...current.map,          ...patch.map }          : current.map,
      navigation:   patch.navigation   ? { ...current.navigation,   ...patch.navigation }   : current.navigation,
      notification: patch.notification ? { ...current.notification, ...patch.notification } : current.notification,
    };
    await this.db
      .insert(userPreferences)
      .values({ userId, prefs: merged, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { prefs: merged, updatedAt: new Date() },
      });
    return merged;
  }
}
