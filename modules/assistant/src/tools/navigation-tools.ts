/**
 * Navigation-related tool definitions and handlers for the AI assistant.
 *
 * Route and traffic data is not yet wired to a real Valhalla instance;
 * all handlers return structured stubs so the LLM can mention that
 * routing data is being fetched or is unavailable, without fabricating ETAs.
 *
 * When the routing module is connected, replace the stub bodies with
 * real calls through the RoutingEngine port from @iraq-maps/contracts.
 */

import type { PlacesSearchFn } from '../assistant.service.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function notAvailableBlock(feature: string): string {
  return `[${feature}: بيانات غير متوفرة حالياً — لا تخترع أوقاتاً أو مسافات]`;
}

// ─── Tool: getRoute ───────────────────────────────────────────────────────────

export interface GetRouteInput {
  originName?: string;
  originPlaceId?: string;
  destinationName: string;
  destinationPlaceId?: string;
  mode?: 'driving' | 'walking' | 'cycling' | 'transit';
  city?: string;
}

/**
 * Get directions between two places.
 * Resolves place names to IDs via search, then stubs the routing response.
 */
export async function getRoute(
  input: GetRouteInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; originPlaceId?: string; destinationPlaceId?: string }> {
  const mode = input.mode ?? 'driving';
  const modeLabel: Record<string, string> = {
    driving: 'بالسيارة',
    walking: 'مشياً',
    cycling: 'بالدراجة',
    transit: 'بالمواصلات العامة',
  };

  // Resolve destination
  let destId = input.destinationPlaceId;
  let destName = input.destinationName;
  if (!destId) {
    const results = await placesSearch(input.destinationName, input.city);
    if (results[0]) {
      destId = results[0].id;
      destName = results[0].name;
    }
  }

  // Resolve origin if given
  let originId = input.originPlaceId;
  let originName = input.originName ?? 'موقعك الحالي';
  if (input.originName && !originId) {
    const results = await placesSearch(input.originName, input.city);
    if (results[0]) {
      originId = results[0].id;
      originName = results[0].name;
    }
  }

  const lines = [
    `الاتجاهات من "${originName}" إلى "${destName}" (${modeLabel[mode] ?? mode}):`,
    notAvailableBlock('بيانات المسار'),
    `يمكن عرض المسار الفعلي على الخريطة في التطبيق.`,
  ];
  if (destId) lines.push(`معرّف الوجهة: ${destId}`);
  if (originId) lines.push(`معرّف نقطة الانطلاق: ${originId}`);

  return { text: lines.join('\n'), originPlaceId: originId, destinationPlaceId: destId };
}

export const getRouteToolDef = {
  name: 'get_route',
  description:
    'احصل على الاتجاهات بين مكانين — اسأل عنها عندما يريد المستخدم الوصول لمكان.',
  inputSchema: {
    type: 'object',
    properties: {
      originName: { type: 'string', description: 'اسم نقطة الانطلاق (اتركه فارغاً للموقع الحالي)' },
      originPlaceId: { type: 'string', description: 'معرّف نقطة الانطلاق (اختياري)' },
      destinationName: { type: 'string', description: 'اسم الوجهة' },
      destinationPlaceId: { type: 'string', description: 'معرّف الوجهة (اختياري)' },
      mode: {
        type: 'string',
        enum: ['driving', 'walking', 'cycling', 'transit'],
        description: 'وسيلة التنقل (افتراضي: driving)',
      },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
    required: ['destinationName'],
  },
} as const;

// ─── Tool: getTrafficInfo ─────────────────────────────────────────────────────

export interface GetTrafficInfoInput {
  routeName?: string;
  originName?: string;
  destinationName?: string;
  city?: string;
}

/**
 * Return current traffic status on a route.
 * Stub: traffic data not yet connected.
 */
export async function getTrafficInfo(
  input: GetTrafficInfoInput,
  _placesSearch: PlacesSearchFn,
): Promise<{ text: string }> {
  const routeDesc = input.routeName
    ?? (input.originName && input.destinationName
      ? `من "${input.originName}" إلى "${input.destinationName}"`
      : 'المسار المحدد');

  return {
    text: [
      `حالة المرور على ${routeDesc}:`,
      notAvailableBlock('بيانات المرور اللحظية'),
      `لا تذكر مستوى ازدحام محدداً بدون بيانات حقيقية.`,
    ].join('\n'),
  };
}

export const getTrafficInfoToolDef = {
  name: 'get_traffic_info',
  description:
    'تحقق من حالة المرور الحالية على مسار أو طريق.',
  inputSchema: {
    type: 'object',
    properties: {
      routeName: { type: 'string', description: 'اسم الطريق أو الشارع' },
      originName: { type: 'string', description: 'اسم نقطة الانطلاق' },
      destinationName: { type: 'string', description: 'اسم الوجهة' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
  },
} as const;

// ─── Tool: estimateArrivalTime ────────────────────────────────────────────────

export interface EstimateArrivalTimeInput {
  destinationName: string;
  destinationPlaceId?: string;
  departureTime?: string;
  mode?: 'driving' | 'walking' | 'cycling' | 'transit';
  city?: string;
}

/**
 * Estimate arrival time at a destination including traffic.
 * Returns a stub noting that ETA is unavailable without routing integration.
 */
export async function estimateArrivalTime(
  input: EstimateArrivalTimeInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; destinationPlaceId?: string }> {
  let destId = input.destinationPlaceId;
  let destName = input.destinationName;

  if (!destId) {
    const results = await placesSearch(input.destinationName, input.city);
    if (results[0]) {
      destId = results[0].id;
      destName = results[0].name;
    }
  }

  const mode = input.mode ?? 'driving';
  const modeLabel: Record<string, string> = {
    driving: 'بالسيارة', walking: 'مشياً', cycling: 'بالدراجة', transit: 'بالمواصلات',
  };
  const dept = input.departureTime ?? 'الآن';

  return {
    text: [
      `وقت الوصول التقديري إلى "${destName}":`,
      `وسيلة التنقل: ${modeLabel[mode] ?? mode}`,
      `وقت المغادرة: ${dept}`,
      notAvailableBlock('حساب وقت الوصول'),
      `استخدم خاصية الملاحة في التطبيق للحصول على الوقت الفعلي.`,
      destId ? `معرّف الوجهة: ${destId}` : '',
    ].filter(Boolean).join('\n'),
    destinationPlaceId: destId,
  };
}

export const estimateArrivalTimeToolDef = {
  name: 'estimate_arrival_time',
  description:
    'قدّر وقت الوصول إلى وجهة مع مراعاة حركة المرور.',
  inputSchema: {
    type: 'object',
    properties: {
      destinationName: { type: 'string', description: 'اسم الوجهة' },
      destinationPlaceId: { type: 'string', description: 'معرّف الوجهة (اختياري)' },
      departureTime: { type: 'string', description: 'وقت المغادرة (اختياري، افتراضي: الآن)' },
      mode: {
        type: 'string',
        enum: ['driving', 'walking', 'cycling', 'transit'],
      },
      city: { type: 'string' },
    },
    required: ['destinationName'],
  },
} as const;

// ─── Tool: findParkingNearby ──────────────────────────────────────────────────

export interface FindParkingNearbyInput {
  nearPlaceName: string;
  nearPlaceId?: string;
  city?: string;
}

/**
 * Find parking spots near a destination.
 * Uses the places search to find مواقف سيارات (parking lots) nearby.
 */
export async function findParkingNearby(
  input: FindParkingNearbyInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds: string[]; placeNames: Record<string, string> }> {
  // First resolve the reference place
  let refName = input.nearPlaceName;
  if (!input.nearPlaceId) {
    const refs = await placesSearch(input.nearPlaceName, input.city);
    if (refs[0]) refName = refs[0].name;
  }

  // Search for parking lots
  const parkingResults = await placesSearch(`مواقف سيارات قرب ${refName}`, input.city);
  const limited = parkingResults.slice(0, 5);

  if (limited.length === 0) {
    return {
      text: `لم يُعثر على مواقف سيارات قرب "${refName}".\n[بيانات المواقف غير متوفرة حالياً]`,
      placeIds: [],
      placeNames: {},
    };
  }

  const placeNames: Record<string, string> = {};
  for (const p of limited) placeNames[p.id] = p.name;

  const lines = [
    `مواقف السيارات القريبة من "${refName}":`,
    ...limited.map(p => {
      const dist = p.distanceMeters != null
        ? ` — ${p.distanceMeters < 1000 ? `${p.distanceMeters}م` : `${(p.distanceMeters / 1000).toFixed(1)}كم`}`
        : '';
      return `• ${p.name} — ${p.address}${dist} [id:${p.id}]`;
    }),
  ];

  return { text: lines.join('\n'), placeIds: limited.map(p => p.id), placeNames };
}

export const findParkingNearbyToolDef = {
  name: 'find_parking_nearby',
  description:
    'ابحث عن مواقف سيارات قريبة من وجهة محددة.',
  inputSchema: {
    type: 'object',
    properties: {
      nearPlaceName: { type: 'string', description: 'اسم المكان المقصود' },
      nearPlaceId: { type: 'string', description: 'معرّف المكان المقصود (اختياري)' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
    required: ['nearPlaceName'],
  },
} as const;

// ─── Tool: getPublicTransitOptions ────────────────────────────────────────────

export interface GetPublicTransitOptionsInput {
  originName?: string;
  destinationName: string;
  city?: string;
}

/**
 * Return public transit options (bus routes etc.) between two points.
 * Stub: transit data not yet integrated.
 */
export async function getPublicTransitOptions(
  input: GetPublicTransitOptionsInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; destinationPlaceId?: string }> {
  let destId: string | undefined;
  let destName = input.destinationName;

  const destResults = await placesSearch(input.destinationName, input.city);
  if (destResults[0]) {
    destId = destResults[0].id;
    destName = destResults[0].name;
  }

  const origin = input.originName ?? 'موقعك الحالي';

  return {
    text: [
      `خيارات المواصلات العامة من "${origin}" إلى "${destName}":`,
      notAvailableBlock('بيانات المواصلات العامة'),
      `بيانات خطوط الحافلات والمواصلات ستتوفر في نسخة قادمة من التطبيق.`,
      destId ? `معرّف الوجهة: ${destId}` : '',
    ].filter(Boolean).join('\n'),
    destinationPlaceId: destId,
  };
}

export const getPublicTransitOptionsToolDef = {
  name: 'get_public_transit_options',
  description:
    'احصل على خيارات المواصلات العامة (حافلات) بين نقطتين.',
  inputSchema: {
    type: 'object',
    properties: {
      originName: { type: 'string', description: 'نقطة الانطلاق (اختياري)' },
      destinationName: { type: 'string', description: 'الوجهة' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
    required: ['destinationName'],
  },
} as const;

// ─── All navigation tool definitions ─────────────────────────────────────────

export const NAVIGATION_TOOL_DEFS = [
  getRouteToolDef,
  getTrafficInfoToolDef,
  estimateArrivalTimeToolDef,
  findParkingNearbyToolDef,
  getPublicTransitOptionsToolDef,
] as const;

export type NavigationToolName = (typeof NAVIGATION_TOOL_DEFS)[number]['name'];

/** Dispatch a navigation tool call by name. */
export async function dispatchNavigationTool(
  name: NavigationToolName,
  input: Record<string, unknown>,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds?: string[]; placeNames?: Record<string, string> }> {
  switch (name) {
    case 'get_route': {
      const r = await getRoute(input as unknown as GetRouteInput, placesSearch);
      const ids = [r.originPlaceId, r.destinationPlaceId].filter(Boolean) as string[];
      return { text: r.text, placeIds: ids };
    }
    case 'get_traffic_info': {
      const r = await getTrafficInfo(input as unknown as GetTrafficInfoInput, placesSearch);
      return { text: r.text };
    }
    case 'estimate_arrival_time': {
      const r = await estimateArrivalTime(input as unknown as EstimateArrivalTimeInput, placesSearch);
      return { text: r.text, placeIds: r.destinationPlaceId ? [r.destinationPlaceId] : [] };
    }
    case 'find_parking_nearby': {
      return findParkingNearby(input as unknown as FindParkingNearbyInput, placesSearch);
    }
    case 'get_public_transit_options': {
      const r = await getPublicTransitOptions(input as unknown as GetPublicTransitOptionsInput, placesSearch);
      return { text: r.text, placeIds: r.destinationPlaceId ? [r.destinationPlaceId] : [] };
    }
    default: {
      const _exhaustive: never = name;
      return { text: `أداة غير معروفة: ${String(_exhaustive)}` };
    }
  }
}
