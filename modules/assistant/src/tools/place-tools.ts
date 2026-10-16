/**
 * Place-related tool definitions and handlers for the AI assistant.
 *
 * Each exported function is a tool handler: it receives the raw tool input
 * from the LLM and a PlacesSearchFn, runs the lookup, and returns a
 * structured text result the assistant can cite in its reply.
 *
 * Rules:
 * - Never fabricate place data. Every fact comes from placesSearch results.
 * - Prices / crowding always carry confidence notes (Estimate<T> pattern).
 * - All user-facing strings in this module are NOT user-visible; they are
 *   intermediate tool results consumed by the LLM. No t() needed here.
 */

import type { PlacesSearchFn } from '../assistant.service.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function distLabel(meters: number | undefined): string {
  if (meters == null) return '';
  if (meters < 1000) return ` — ${meters}م`;
  return ` — ${(meters / 1000).toFixed(1)}كم`;
}

function placeOneLine(p: {
  id: string;
  name: string;
  address: string;
  category?: string;
  distanceMeters?: number;
}): string {
  const cat = p.category ? ` (${p.category})` : '';
  return `• ${p.name}${cat} — ${p.address}${distLabel(p.distanceMeters)} [id:${p.id}]`;
}

/** Clamp a number to [min, max] */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ─── Tool: searchPlaces ───────────────────────────────────────────────────────

export interface SearchPlacesInput {
  query: string;
  city?: string;
  category?: string;
  limit?: number;
}

/**
 * Search for places by name, free-text query, and optional city/category filter.
 * Returns up to `limit` (default 8, max 20) results as a formatted text block.
 */
export async function searchPlaces(
  input: SearchPlacesInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds: string[]; placeNames: Record<string, string> }> {
  const limit = clamp(input.limit ?? 8, 1, 20);
  // Build a composite query that includes category if provided
  const q = input.category ? `${input.category} ${input.query}` : input.query;
  const results = await placesSearch(q, input.city);

  if (results.length === 0) {
    return {
      text: `لم يتم العثور على نتائج لـ "${input.query}"${input.city ? ` في ${input.city}` : ''}.`,
      placeIds: [],
      placeNames: {},
    };
  }

  const limited = results.slice(0, limit);
  const lines = [
    `نتائج البحث عن "${input.query}"${input.city ? ` في ${input.city}` : ''} (${limited.length} نتيجة):`,
    ...limited.map(placeOneLine),
  ];

  const placeNames: Record<string, string> = {};
  for (const p of limited) placeNames[p.id] = p.name;

  return { text: lines.join('\n'), placeIds: limited.map(p => p.id), placeNames };
}

export const searchPlacesToolDef = {
  name: 'search_places_v2',
  description:
    'ابحث عن أماكن في العراق بالاسم أو التصنيف. استخدمها عند طلب قائمة أماكن.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'نص البحث' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
      category: { type: 'string', description: 'التصنيف مثل مطاعم، فنادق (اختياري)' },
      limit: { type: 'number', description: 'عدد النتائج (1-20، افتراضي 8)' },
    },
    required: ['query'],
  },
} as const;

// ─── Tool: getPlaceDetails ────────────────────────────────────────────────────

export interface GetPlaceDetailsInput {
  placeId?: string;
  placeName?: string;
  city?: string;
}

/**
 * Retrieve full details for a specific place by ID or name.
 * Performs a targeted search and returns the best match with all available fields.
 */
export async function getPlaceDetails(
  input: GetPlaceDetailsInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeId?: string; placeName?: string }> {
  if (!input.placeId && !input.placeName) {
    return { text: 'خطأ: يجب تحديد معرّف المكان أو اسمه.' };
  }

  const q = input.placeId ?? input.placeName!;
  const results = await placesSearch(q, input.city);

  if (results.length === 0) {
    return { text: `لم يُعثر على "${q}".` };
  }

  const place = results[0]!;
  const lines = [
    `تفاصيل المكان:`,
    `الاسم: ${place.name}`,
    `العنوان: ${place.address}`,
    place.category ? `التصنيف: ${place.category}` : null,
    place.distanceMeters != null ? `المسافة: ${distLabel(place.distanceMeters).trim()}` : null,
    `معرّف المكان: ${place.id}`,
  ].filter(Boolean) as string[];

  return { text: lines.join('\n'), placeId: place.id, placeName: place.name };
}

export const getPlaceDetailsToolDef = {
  name: 'get_place_details',
  description:
    'احصل على تفاصيل كاملة لمكان محدد بالاسم أو المعرّف.',
  inputSchema: {
    type: 'object',
    properties: {
      placeId: { type: 'string', description: 'معرّف المكان' },
      placeName: { type: 'string', description: 'اسم المكان' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
  },
} as const;

// ─── Tool: getNearbyPlaces ────────────────────────────────────────────────────

export interface GetNearbyPlacesInput {
  category: string;
  radiusMeters?: number;
  city?: string;
  limit?: number;
}

/**
 * Find places of a given category within an approximate radius.
 * radiusMeters is used only as a label — actual geo-filtering depends on
 * the placesSearch implementation (it may use the user's location server-side).
 */
export async function getNearbyPlaces(
  input: GetNearbyPlacesInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds: string[]; placeNames: Record<string, string> }> {
  const limit = clamp(input.limit ?? 6, 1, 15);
  const radius = input.radiusMeters ?? 2000;

  const results = await placesSearch(input.category, input.city);
  // Sort by distance if available
  const sorted = [...results].sort((a, b) =>
    (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
  );
  // Filter to approximate radius
  const nearby = sorted
    .filter(p => (p.distanceMeters ?? 0) <= radius || p.distanceMeters == null)
    .slice(0, limit);

  if (nearby.length === 0) {
    return {
      text: `لا توجد ${input.category} ضمن ${radius < 1000 ? `${radius}م` : `${(radius / 1000).toFixed(1)}كم`}${input.city ? ` في ${input.city}` : ''}.`,
      placeIds: [],
      placeNames: {},
    };
  }

  const lines = [
    `${input.category} القريبة (ضمن ${radius < 1000 ? `${radius}م` : `${(radius / 1000).toFixed(1)}كم`}):`,
    ...nearby.map(placeOneLine),
  ];

  const placeNames: Record<string, string> = {};
  for (const p of nearby) placeNames[p.id] = p.name;

  return { text: lines.join('\n'), placeIds: nearby.map(p => p.id), placeNames };
}

export const getNearbyPlacesToolDef = {
  name: 'get_nearby_places',
  description:
    'ابحث عن أماكن قريبة من الموقع الحالي ضمن نطاق محدد.',
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'نوع المكان مثل مطاعم، صيدليات' },
      radiusMeters: { type: 'number', description: 'نطاق البحث بالأمتار (افتراضي 2000)' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
      limit: { type: 'number', description: 'عدد النتائج (افتراضي 6)' },
    },
    required: ['category'],
  },
} as const;

// ─── Tool: comparePlaces ─────────────────────────────────────────────────────

export interface ComparePlacesInput {
  placeAName: string;
  placeBName: string;
  city?: string;
}

/**
 * Compare two places side-by-side on available data fields.
 * Returns a structured comparison that the LLM can narrate.
 */
export async function comparePlaces(
  input: ComparePlacesInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds: string[] }> {
  const [aResults, bResults] = await Promise.all([
    placesSearch(input.placeAName, input.city),
    placesSearch(input.placeBName, input.city),
  ]);

  const a = aResults[0];
  const b = bResults[0];

  if (!a && !b) {
    return { text: `لم يُعثر على "${input.placeAName}" ولا "${input.placeBName}".`, placeIds: [] };
  }
  if (!a) return { text: `لم يُعثر على "${input.placeAName}".`, placeIds: b ? [b.id] : [] };
  if (!b) return { text: `لم يُعثر على "${input.placeBName}".`, placeIds: [a.id] };

  const row = (label: string, av: string | undefined, bv: string | undefined) =>
    av || bv ? `${label}: ${av ?? '—'} | ${bv ?? '—'}` : null;

  const lines = [
    `مقارنة بين "${a.name}" و "${b.name}":`,
    ``,
    `الحقل              | ${a.name} | ${b.name}`,
    `---`,
    row('العنوان', a.address, b.address),
    row('التصنيف', a.category, b.category),
    row('المسافة', a.distanceMeters != null ? distLabel(a.distanceMeters).trim() : undefined, b.distanceMeters != null ? distLabel(b.distanceMeters).trim() : undefined),
    ``,
    `المعرّفات: ${a.id} | ${b.id}`,
  ].filter(v => v !== null) as string[];

  return { text: lines.join('\n'), placeIds: [a.id, b.id] };
}

export const comparePlacesToolDef = {
  name: 'compare_places',
  description:
    'قارن بين مكانين من حيث الموقع والتصنيف والمسافة.',
  inputSchema: {
    type: 'object',
    properties: {
      placeAName: { type: 'string', description: 'اسم المكان الأول' },
      placeBName: { type: 'string', description: 'اسم المكان الثاني' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
    required: ['placeAName', 'placeBName'],
  },
} as const;

// ─── Tool: getPlaceReviews ────────────────────────────────────────────────────

export interface GetPlaceReviewsInput {
  placeId?: string;
  placeName?: string;
  city?: string;
}

/**
 * Retrieve top review summary for a place.
 * Currently a stub: returns a placeholder since review data is not yet
 * integrated. The LLM will note the stub and not fabricate ratings.
 */
export async function getPlaceReviews(
  input: GetPlaceReviewsInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeId?: string }> {
  const q = input.placeId ?? input.placeName ?? '';
  if (!q) return { text: 'يجب تحديد اسم المكان أو معرّفه.' };

  const results = await placesSearch(q, input.city);
  const place = results[0];
  if (!place) return { text: `لم يُعثر على "${q}".` };

  // Stub: review data not yet available from the places module
  return {
    text: [
      `التقييمات لـ "${place.name}":`,
      `[بيانات التقييمات غير متوفرة حالياً — لا تُنشئ تقييمات وهمية]`,
      `يمكن للمستخدمين مشاهدة التقييمات الحقيقية في صفحة المكان داخل التطبيق.`,
      `معرّف المكان: ${place.id}`,
    ].join('\n'),
    placeId: place.id,
  };
}

export const getPlaceReviewsToolDef = {
  name: 'get_place_reviews',
  description:
    'احصل على ملخص التقييمات لمكان محدد.',
  inputSchema: {
    type: 'object',
    properties: {
      placeId: { type: 'string', description: 'معرّف المكان' },
      placeName: { type: 'string', description: 'اسم المكان' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
  },
} as const;

// ─── Tool: getPlaceCrowding ───────────────────────────────────────────────────

export interface GetPlaceCrowdingInput {
  placeId?: string;
  placeName?: string;
  city?: string;
}

/**
 * Return crowding estimate for a place with explicit confidence and source.
 * Implements the Estimate<T> pattern from CLAUDE.md: confidence and observedAt
 * are always present when crowding data is returned.
 */
export async function getPlaceCrowding(
  input: GetPlaceCrowdingInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeId?: string }> {
  const q = input.placeId ?? input.placeName ?? '';
  if (!q) return { text: 'يجب تحديد اسم المكان أو معرّفه.' };

  const results = await placesSearch(q, input.city);
  const place = results[0];
  if (!place) return { text: `لم يُعثر على "${q}".` };

  // Stub: insights module not yet connected. Return empty estimate.
  const observedAt = new Date().toISOString();
  return {
    text: [
      `ازدحام "${place.name}":`,
      `الحالة: غير متوفر`,
      `[لا توجد بيانات ازدحام حقيقية — المصدر: stub، الثقة: 0، observedAt: ${observedAt}]`,
      `لا تذكر مستوى ازدحام بدون بيانات حقيقية.`,
    ].join('\n'),
    placeId: place.id,
  };
}

export const getPlaceCrowdingToolDef = {
  name: 'get_place_crowding',
  description:
    'احصل على مستوى الازدحام الحالي والمتوقع لمكان محدد.',
  inputSchema: {
    type: 'object',
    properties: {
      placeId: { type: 'string', description: 'معرّف المكان' },
      placeName: { type: 'string', description: 'اسم المكان' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
  },
} as const;

// ─── Tool: getPlaceHours ──────────────────────────────────────────────────────

export interface GetPlaceHoursInput {
  placeId?: string;
  placeName?: string;
  city?: string;
}

/**
 * Check if a place is open now and return its hours.
 * Hours data stub — real data comes from the providers module.
 */
export async function getPlaceHours(
  input: GetPlaceHoursInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeId?: string }> {
  const q = input.placeId ?? input.placeName ?? '';
  if (!q) return { text: 'يجب تحديد اسم المكان أو معرّفه.' };

  const results = await placesSearch(q, input.city);
  const place = results[0];
  if (!place) return { text: `لم يُعثر على "${q}".` };

  return {
    text: [
      `أوقات عمل "${place.name}":`,
      `[بيانات أوقات العمل غير متوفرة حالياً — لا تذكر أوقات محددة بدون مصدر]`,
      `يمكن الاطلاع على أوقات العمل الحقيقية في صفحة المكان.`,
      `معرّف المكان: ${place.id}`,
    ].join('\n'),
    placeId: place.id,
  };
}

export const getPlaceHoursToolDef = {
  name: 'get_place_hours',
  description:
    'تحقق من أوقات عمل مكان — هل هو مفتوح الآن؟',
  inputSchema: {
    type: 'object',
    properties: {
      placeId: { type: 'string', description: 'معرّف المكان' },
      placeName: { type: 'string', description: 'اسم المكان' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
  },
} as const;

// ─── Tool: getPlacePhotos ─────────────────────────────────────────────────────

export interface GetPlacePhotosInput {
  placeId?: string;
  placeName?: string;
  city?: string;
}

/**
 * Describe available photos for a place.
 * Photo descriptions are stubs — the real adapter goes through the media module.
 */
export async function getPlacePhotos(
  input: GetPlacePhotosInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeId?: string }> {
  const q = input.placeId ?? input.placeName ?? '';
  if (!q) return { text: 'يجب تحديد اسم المكان أو معرّفه.' };

  const results = await placesSearch(q, input.city);
  const place = results[0];
  if (!place) return { text: `لم يُعثر على "${q}".` };

  return {
    text: [
      `صور "${place.name}":`,
      `[بيانات الصور غير متوفرة حالياً — لا تصف صوراً وهمية]`,
      `يمكن مشاهدة الصور الحقيقية في صفحة المكان.`,
    ].join('\n'),
    placeId: place.id,
  };
}

export const getPlacePhotosToolDef = {
  name: 'get_place_photos',
  description:
    'احصل على وصف صور مكان محدد.',
  inputSchema: {
    type: 'object',
    properties: {
      placeId: { type: 'string', description: 'معرّف المكان' },
      placeName: { type: 'string', description: 'اسم المكان' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
  },
} as const;

// ─── All place tool definitions (for LLM tool list) ──────────────────────────

export const PLACE_TOOL_DEFS = [
  searchPlacesToolDef,
  getPlaceDetailsToolDef,
  getNearbyPlacesToolDef,
  comparePlacesToolDef,
  getPlaceReviewsToolDef,
  getPlaceCrowdingToolDef,
  getPlaceHoursToolDef,
  getPlacePhotosToolDef,
] as const;

export type PlaceToolName = (typeof PLACE_TOOL_DEFS)[number]['name'];

/** Dispatch a place tool call by name. Returns text result + any placeIds. */
export async function dispatchPlaceTool(
  name: PlaceToolName,
  input: Record<string, unknown>,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds?: string[]; placeNames?: Record<string, string> }> {
  switch (name) {
    case 'search_places_v2':
      return searchPlaces(input as unknown as SearchPlacesInput, placesSearch);
    case 'get_place_details':
      return getPlaceDetails(input as unknown as GetPlaceDetailsInput, placesSearch);
    case 'get_nearby_places':
      return getNearbyPlaces(input as unknown as GetNearbyPlacesInput, placesSearch);
    case 'compare_places':
      return comparePlaces(input as unknown as ComparePlacesInput, placesSearch);
    case 'get_place_reviews': {
      const r = await getPlaceReviews(input as unknown as GetPlaceReviewsInput, placesSearch);
      return { text: r.text, placeIds: r.placeId ? [r.placeId] : [] };
    }
    case 'get_place_crowding': {
      const r = await getPlaceCrowding(input as unknown as GetPlaceCrowdingInput, placesSearch);
      return { text: r.text, placeIds: r.placeId ? [r.placeId] : [] };
    }
    case 'get_place_hours': {
      const r = await getPlaceHours(input as unknown as GetPlaceHoursInput, placesSearch);
      return { text: r.text, placeIds: r.placeId ? [r.placeId] : [] };
    }
    case 'get_place_photos': {
      const r = await getPlacePhotos(input as unknown as GetPlacePhotosInput, placesSearch);
      return { text: r.text, placeIds: r.placeId ? [r.placeId] : [] };
    }
    default: {
      const _exhaustive: never = name;
      return { text: `أداة غير معروفة: ${String(_exhaustive)}` };
    }
  }
}
