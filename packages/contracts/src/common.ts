import { z } from 'zod';

export const UserId = z.string().uuid().brand<'UserId'>();
export type UserId = z.infer<typeof UserId>;
export const PlaceId = z.string().min(1).brand<'PlaceId'>();
export type PlaceId = z.infer<typeof PlaceId>;
/** @public frozen contract, consumed from M1 */
export const CityId = z.string().max(64).regex(/^[a-z][a-z0-9-]*$/).brand<'CityId'>();
export type CityId = z.infer<typeof CityId>;

export const Locale = z.enum(['ar', 'ckb', 'en']);
export type Locale = z.infer<typeof Locale>;
export const Role = z.enum(['user', 'provider', 'moderator', 'admin']);
export type Role = z.infer<typeof Role>;

/** Iraqi mobile number in E.164 (+964 7xx xxx xxxx). Clients normalize 07xx input before sending. */
export const IraqiPhone = z.string().regex(/^\+9647\d{9}$/);
export type IraqiPhone = z.infer<typeof IraqiPhone>;

/** @public frozen contract, consumed from M1 */
export const LngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LngLat = z.infer<typeof LngLat>;
/** [west, south, east, north]
 * @public frozen contract, consumed from M1 */
export const BBox = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type BBox = z.infer<typeof BBox>;

/** RFC 9457 problem details. `code` is a stable machine-readable key for i18n on the client. */
export const Problem = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  code: z.string().optional(),
  detail: z.string().optional(),
});
export type Problem = z.infer<typeof Problem>;

/** @public frozen contract, consumed from M1 */
export const paginated = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });
/** @public frozen contract, consumed from M1 */
export type Paginated<T> = { items: T[]; nextCursor: string | null };

/** Prices and crowding are never bare values (CLAUDE.md rule 5).
 * @public frozen contract, consumed from M1 */
export const EstimateSource = z.enum(['provider', 'user_report', 'osm', 'heuristic']);
export const estimate = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, source: EstimateSource, observedAt: z.string().datetime(), confidence: z.number().min(0).max(1) });
/** @public frozen contract, consumed from M1 */
export type Estimate<T> = { value: T; source: z.infer<typeof EstimateSource>; observedAt: string; confidence: number };
