/**
 * Recommendation-related tool definitions and handlers.
 *
 * These tools help the assistant give personalised, context-aware suggestions.
 * All price / crowding estimates follow the Estimate<T> contract:
 * source, observedAt, and confidence are always stated when present.
 */

import type { PlacesSearchFn } from '../assistant.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distLabel(m: number | undefined): string {
  if (m == null) return '';
  return m < 1000 ? ` — ${m}م` : ` — ${(m / 1000).toFixed(1)}كم`;
}

function placeOneLine(p: {
  id: string;
  name: string;
  address: string;
  category?: string;
  distanceMeters?: number;
}): string {
  return `• ${p.name}${p.category ? ` (${p.category})` : ''} — ${p.address}${distLabel(p.distanceMeters)} [id:${p.id}]`;
}

function stubEstimate(label: string): string {
  return `[${label}: مصدر stub، الثقة: 0 — لا تذكر قيمة محددة]`;
}

// ─── Tool: getPersonalizedRecommendations ─────────────────────────────────────

export interface GetPersonalizedRecommendationsInput {
  interests?: string[];
  city?: string;
  limit?: number;
}

/**
 * Return personalised place recommendations based on declared interests.
 */
export async function getPersonalizedRecommendations(
  input: GetPersonalizedRecommendationsInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds: string[]; placeNames: Record<string, string> }> {
  const interests = input.interests?.length ? input.interests : ['مطاعم', 'معالم سياحية', 'مقاهي'];
  const limit = Math.min(input.limit ?? 6, 15);

  const results = await Promise.all(
    interests.slice(0, 3).map(i => placesSearch(i, input.city)),
  );
  const flat = results.flat().filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  const sorted = [...flat].sort((a, b) => (a.distanceMeters ?? 9999) - (b.distanceMeters ?? 9999));
  const limited = sorted.slice(0, limit);

  if (limited.length === 0) {
    return {
      text: `لا توجد توصيات متاحة حالياً${input.city ? ` في ${input.city}` : ''}.`,
      placeIds: [],
      placeNames: {},
    };
  }

  const placeNames: Record<string, string> = {};
  for (const p of limited) placeNames[p.id] = p.name;

  const lines = [
    `توصيات مخصصة (${limited.length} مكان):`,
    ...limited.map(placeOneLine),
  ];

  return { text: lines.join('\n'), placeIds: limited.map(p => p.id), placeNames };
}

export const getPersonalizedRecommendationsToolDef = {
  name: 'get_personalized_recommendations',
  description:
    'احصل على توصيات مخصصة بناءً على اهتمامات المستخدم.',
  inputSchema: {
    type: 'object',
    properties: {
      interests: {
        type: 'array',
        items: { type: 'string' },
        description: 'قائمة الاهتمامات مثل مطاعم، حدائق، تسوق',
      },
      city: { type: 'string', description: 'المدينة (اختياري)' },
      limit: { type: 'number', description: 'عدد التوصيات (افتراضي 6، أقصى 15)' },
    },
  },
} as const;

// ─── Tool: getSimilarPlaces ───────────────────────────────────────────────────

export interface GetSimilarPlacesInput {
  referencePlaceName: string;
  referencePlaceId?: string;
  city?: string;
  limit?: number;
}

/**
 * Find places similar to a reference place (same category, nearby area).
 */
export async function getSimilarPlaces(
  input: GetSimilarPlacesInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds: string[]; placeNames: Record<string, string> }> {
  const limit = Math.min(input.limit ?? 5, 10);

  // Resolve reference place first
  const refResults = await placesSearch(input.referencePlaceName, input.city);
  const ref = refResults[0];
  if (!ref) {
    return {
      text: `لم يُعثر على "${input.referencePlaceName}".`,
      placeIds: [],
      placeNames: {},
    };
  }

  // Search for similar places using category if available
  const searchQuery = ref.category ?? input.referencePlaceName;
  const candidates = await placesSearch(searchQuery, input.city);
  // Exclude the reference place itself
  const similar = candidates.filter(p => p.id !== ref.id).slice(0, limit);

  if (similar.length === 0) {
    return {
      text: `لم يُعثر على أماكن مشابهة لـ "${ref.name}".`,
      placeIds: [],
      placeNames: {},
    };
  }

  const placeNames: Record<string, string> = {};
  for (const p of similar) placeNames[p.id] = p.name;

  return {
    text: [
      `أماكن مشابهة لـ "${ref.name}":`,
      ...similar.map(placeOneLine),
    ].join('\n'),
    placeIds: similar.map(p => p.id),
    placeNames,
  };
}

export const getSimilarPlacesToolDef = {
  name: 'get_similar_places',
  description:
    'ابحث عن أماكن مشابهة لمكان محدد من نفس الفئة.',
  inputSchema: {
    type: 'object',
    properties: {
      referencePlaceName: { type: 'string', description: 'اسم المكان المرجعي' },
      referencePlaceId: { type: 'string', description: 'معرّف المكان المرجعي (اختياري)' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
      limit: { type: 'number', description: 'عدد النتائج (افتراضي 5)' },
    },
    required: ['referencePlaceName'],
  },
} as const;

// ─── Tool: getTrendingInCity ──────────────────────────────────────────────────

export interface GetTrendingInCityInput {
  city: string;
  category?: string;
  limit?: number;
}

/**
 * Return what's currently popular/trending in a city.
 * Popularity signals are not yet available; returns top search results
 * with a stub note.
 */
export async function getTrendingInCity(
  input: GetTrendingInCityInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds: string[]; placeNames: Record<string, string> }> {
  const limit = Math.min(input.limit ?? 6, 12);
  const query = input.category ? `${input.category} شهير` : 'أماكن شهيرة';

  const results = await placesSearch(query, input.city);
  const limited = results.slice(0, limit);

  const placeNames: Record<string, string> = {};
  for (const p of limited) placeNames[p.id] = p.name;

  const lines = [
    `الأماكن الرائجة في ${input.city}${input.category ? ` (${input.category})` : ''}:`,
    stubEstimate('بيانات الرواج'),
    ...limited.map(placeOneLine),
    limited.length === 0 ? 'لا توجد نتائج حالياً.' : '',
  ].filter(Boolean);

  return { text: lines.join('\n'), placeIds: limited.map(p => p.id), placeNames };
}

export const getTrendingInCityToolDef = {
  name: 'get_trending_in_city',
  description:
    'اعرف ما هو رائج ومشهور الآن في مدينة معينة.',
  inputSchema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'اسم المدينة' },
      category: { type: 'string', description: 'التصنيف مثل مطاعم (اختياري)' },
      limit: { type: 'number', description: 'عدد النتائج (افتراضي 6)' },
    },
    required: ['city'],
  },
} as const;

// ─── Tool: getPriceComparison ─────────────────────────────────────────────────

export interface GetPriceComparisonInput {
  category: string;
  city?: string;
  limit?: number;
}

/**
 * Compare prices across similar places in a category.
 * Price data follows the Estimate<T> contract: always note source and confidence.
 */
export async function getPriceComparison(
  input: GetPriceComparisonInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds: string[] }> {
  const limit = Math.min(input.limit ?? 6, 10);
  const results = await placesSearch(input.category, input.city);
  const limited = results.slice(0, limit);

  if (limited.length === 0) {
    return {
      text: `لم يُعثر على ${input.category} لمقارنة الأسعار.`,
      placeIds: [],
    };
  }

  const observedAt = new Date().toISOString();
  const lines = [
    `مقارنة أسعار ${input.category}${input.city ? ` في ${input.city}` : ''}:`,
    `[بيانات الأسعار: مصدر stub، الثقة: 0، observedAt: ${observedAt}]`,
    `لا تذكر أسعاراً محددة بدون بيانات حقيقية.`,
    ``,
    `الأماكن المتاحة:`,
    ...limited.map(placeOneLine),
  ];

  return { text: lines.join('\n'), placeIds: limited.map(p => p.id) };
}

export const getPriceComparisonToolDef = {
  name: 'get_price_comparison',
  description:
    'قارن الأسعار بين أماكن مماثلة في تصنيف واحد.',
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'التصنيف مثل مطاعم، فنادق' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
      limit: { type: 'number', description: 'عدد الأماكن (افتراضي 6)' },
    },
    required: ['category'],
  },
} as const;

// ─── Tool: getBestTimeToVisit ─────────────────────────────────────────────────

export interface GetBestTimeToVisitInput {
  placeName: string;
  placeId?: string;
  city?: string;
}

/**
 * Suggest the best time to visit a place to avoid crowds.
 * Crowd patterns are stubs until the insights module provides real data.
 */
export async function getBestTimeToVisit(
  input: GetBestTimeToVisitInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeId?: string }> {
  const results = await placesSearch(input.placeName, input.city);
  const place = results[0];
  if (!place) {
    return { text: `لم يُعثر على "${input.placeName}".` };
  }

  const observedAt = new Date().toISOString();
  return {
    text: [
      `أفضل وقت لزيارة "${place.name}":`,
      `[بيانات الازدحام: مصدر stub، الثقة: 0، observedAt: ${observedAt}]`,
      `لا تذكر أوقات محددة بدون بيانات ازدحام حقيقية.`,
      `يمكنك الاطلاع على التقييمات والتعليقات في التطبيق للحصول على معلومات من زوار حقيقيين.`,
      `معرّف المكان: ${place.id}`,
    ].join('\n'),
    placeId: place.id,
  };
}

export const getBestTimeToVisitToolDef = {
  name: 'get_best_time_to_visit',
  description:
    'احصل على أفضل وقت لزيارة مكان بعيداً عن الازدحام.',
  inputSchema: {
    type: 'object',
    properties: {
      placeName: { type: 'string', description: 'اسم المكان' },
      placeId: { type: 'string', description: 'معرّف المكان (اختياري)' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
    required: ['placeName'],
  },
} as const;

// ─── All recommendation tool definitions ──────────────────────────────────────

export const RECOMMENDATION_TOOL_DEFS = [
  getPersonalizedRecommendationsToolDef,
  getSimilarPlacesToolDef,
  getTrendingInCityToolDef,
  getPriceComparisonToolDef,
  getBestTimeToVisitToolDef,
] as const;

export type RecommendationToolName = (typeof RECOMMENDATION_TOOL_DEFS)[number]['name'];

/** Dispatch a recommendation tool call by name. */
export async function dispatchRecommendationTool(
  name: RecommendationToolName,
  input: Record<string, unknown>,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds?: string[]; placeNames?: Record<string, string> }> {
  switch (name) {
    case 'get_personalized_recommendations':
      return getPersonalizedRecommendations(input as unknown as GetPersonalizedRecommendationsInput, placesSearch);
    case 'get_similar_places':
      return getSimilarPlaces(input as unknown as GetSimilarPlacesInput, placesSearch);
    case 'get_trending_in_city':
      return getTrendingInCity(input as unknown as GetTrendingInCityInput, placesSearch);
    case 'get_price_comparison': {
      const r = await getPriceComparison(input as unknown as GetPriceComparisonInput, placesSearch);
      return { text: r.text, placeIds: r.placeIds };
    }
    case 'get_best_time_to_visit': {
      const r = await getBestTimeToVisit(input as unknown as GetBestTimeToVisitInput, placesSearch);
      return { text: r.text, placeIds: r.placeId ? [r.placeId] : [] };
    }
    default: {
      const _exhaustive: never = name;
      return { text: `أداة غير معروفة: ${String(_exhaustive)}` };
    }
  }
}
