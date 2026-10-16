/**
 * Business-related tool definitions and handlers.
 *
 * These tools surface business registration info, reviews, appointment
 * availability, and active promotions.
 *
 * Consent rule (CLAUDE.md §6): phone numbers, photos and social links
 * are only included when the provider has granted the matching consent scope.
 * Until the providers module exposes consent scopes to this service,
 * all contact data is redacted with a note.
 */

import type { PlacesSearchFn } from '../assistant.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function consentRedacted(field: string): string {
  return `[${field}: محجوب — الموافقة غير مؤكدة، لا تعرض هذه البيانات]`;
}

function stubData(label: string): string {
  return `[${label}: غير متوفر حالياً — stub]`;
}

// ─── Tool: getBusinessInfo ────────────────────────────────────────────────────

export interface GetBusinessInfoInput {
  businessName: string;
  businessId?: string;
  city?: string;
}

/**
 * Retrieve business registration, hours, and contact info.
 * Contact data (phone, social) is redacted until consent is confirmed.
 */
export async function getBusinessInfo(
  input: GetBusinessInfoInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeId?: string }> {
  const results = await placesSearch(input.businessName, input.city);
  const place = results[0];

  if (!place) {
    return { text: `لم يُعثر على "${input.businessName}".` };
  }

  const lines = [
    `معلومات "${place.name}":`,
    `العنوان: ${place.address}`,
    place.category ? `التصنيف: ${place.category}` : null,
    `الهاتف: ${consentRedacted('رقم الهاتف')}`,
    `التواصل الاجتماعي: ${consentRedacted('صفحات التواصل')}`,
    `أوقات العمل: ${stubData('أوقات العمل')}`,
    `الحالة: ${stubData('مفتوح/مغلق')}`,
    `معرّف المكان: ${place.id}`,
  ].filter(Boolean) as string[];

  return { text: lines.join('\n'), placeId: place.id };
}

export const getBusinessInfoToolDef = {
  name: 'get_business_info',
  description:
    'احصل على معلومات تسجيل العمل التجاري — أوقات، عنوان، حالة الفتح.',
  inputSchema: {
    type: 'object',
    properties: {
      businessName: { type: 'string', description: 'اسم المؤسسة أو المحل' },
      businessId: { type: 'string', description: 'معرّف المؤسسة (اختياري)' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
    required: ['businessName'],
  },
} as const;

// ─── Tool: getBusinessReviews ─────────────────────────────────────────────────

export interface GetBusinessReviewsInput {
  businessName: string;
  businessId?: string;
  city?: string;
}

/**
 * Return a sentiment summary for a business.
 * Real review data will come from the insights/discover modules.
 */
export async function getBusinessReviews(
  input: GetBusinessReviewsInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeId?: string }> {
  const results = await placesSearch(input.businessName, input.city);
  const place = results[0];
  if (!place) return { text: `لم يُعثر على "${input.businessName}".` };

  return {
    text: [
      `ملخص تقييمات "${place.name}":`,
      stubData('بيانات التقييمات'),
      `لا تذكر درجة تقييم أو عدد تقييمات بدون بيانات حقيقية.`,
      `يمكن مشاهدة التقييمات الحقيقية في صفحة المكان داخل التطبيق.`,
      `معرّف المكان: ${place.id}`,
    ].join('\n'),
    placeId: place.id,
  };
}

export const getBusinessReviewsToolDef = {
  name: 'get_business_reviews',
  description:
    'احصل على ملخص المشاعر والتقييمات لمؤسسة تجارية.',
  inputSchema: {
    type: 'object',
    properties: {
      businessName: { type: 'string', description: 'اسم المؤسسة' },
      businessId: { type: 'string', description: 'معرّف المؤسسة (اختياري)' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
    required: ['businessName'],
  },
} as const;

// ─── Tool: checkAppointmentAvailability ──────────────────────────────────────

export interface CheckAppointmentAvailabilityInput {
  businessName: string;
  businessId?: string;
  date?: string;
  city?: string;
}

/**
 * Check available appointment slots for a service business.
 * Appointment data is a stub until the messaging/provider module exposes calendars.
 */
export async function checkAppointmentAvailability(
  input: CheckAppointmentAvailabilityInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeId?: string }> {
  const results = await placesSearch(input.businessName, input.city);
  const place = results[0];
  if (!place) return { text: `لم يُعثر على "${input.businessName}".` };

  const dateLabel = input.date ? ` ليوم ${input.date}` : '';
  return {
    text: [
      `المواعيد المتاحة في "${place.name}"${dateLabel}:`,
      stubData('بيانات المواعيد'),
      `لا تذكر مواعيد محددة بدون بيانات حقيقية.`,
      `لحجز موعد، يمكن مراسلة المؤسسة مباشرة عبر التطبيق.`,
      `معرّف المكان: ${place.id}`,
    ].join('\n'),
    placeId: place.id,
  };
}

export const checkAppointmentAvailabilityToolDef = {
  name: 'check_appointment_availability',
  description:
    'تحقق من المواعيد المتاحة في مؤسسة خدمية.',
  inputSchema: {
    type: 'object',
    properties: {
      businessName: { type: 'string', description: 'اسم المؤسسة' },
      businessId: { type: 'string', description: 'معرّف المؤسسة (اختياري)' },
      date: { type: 'string', description: 'التاريخ المطلوب (اختياري)' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
    },
    required: ['businessName'],
  },
} as const;

// ─── Tool: getPromotion ───────────────────────────────────────────────────────

export interface GetPromotionInput {
  businessName?: string;
  category?: string;
  city?: string;
  limit?: number;
}

/**
 * Return active promotions for a business or category.
 * Promotion data is not yet stored — stub response.
 */
export async function getPromotion(
  input: GetPromotionInput,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds: string[] }> {
  const q = input.businessName ?? input.category ?? 'عروض';
  const results = await placesSearch(q, input.city);
  const limited = results.slice(0, input.limit ?? 5);

  const placeIds = limited.map(p => p.id);

  if (limited.length === 0) {
    return { text: `لم يُعثر على عروض حالية لـ "${q}".`, placeIds: [] };
  }

  return {
    text: [
      `العروض النشطة${input.businessName ? ` في "${input.businessName}"` : input.category ? ` (${input.category})` : ''}:`,
      stubData('بيانات العروض والخصومات'),
      `لا تذكر خصومات أو عروضاً محددة بدون بيانات حقيقية.`,
      `الأماكن المتاحة:`,
      ...limited.map(p => `• ${p.name} — ${p.address} [id:${p.id}]`),
    ].join('\n'),
    placeIds,
  };
}

export const getPromotionToolDef = {
  name: 'get_promotion',
  description:
    'احصل على العروض والخصومات النشطة في مؤسسة أو تصنيف.',
  inputSchema: {
    type: 'object',
    properties: {
      businessName: { type: 'string', description: 'اسم المؤسسة (اختياري)' },
      category: { type: 'string', description: 'التصنيف مثل مطاعم (اختياري)' },
      city: { type: 'string', description: 'المدينة (اختياري)' },
      limit: { type: 'number', description: 'عدد النتائج (افتراضي 5)' },
    },
  },
} as const;

// ─── All business tool definitions ───────────────────────────────────────────

export const BUSINESS_TOOL_DEFS = [
  getBusinessInfoToolDef,
  getBusinessReviewsToolDef,
  checkAppointmentAvailabilityToolDef,
  getPromotionToolDef,
] as const;

export type BusinessToolName = (typeof BUSINESS_TOOL_DEFS)[number]['name'];

/** Dispatch a business tool call by name. */
export async function dispatchBusinessTool(
  name: BusinessToolName,
  input: Record<string, unknown>,
  placesSearch: PlacesSearchFn,
): Promise<{ text: string; placeIds?: string[]; placeNames?: Record<string, string> }> {
  switch (name) {
    case 'get_business_info': {
      const r = await getBusinessInfo(input as unknown as GetBusinessInfoInput, placesSearch);
      return { text: r.text, placeIds: r.placeId ? [r.placeId] : [] };
    }
    case 'get_business_reviews': {
      const r = await getBusinessReviews(input as unknown as GetBusinessReviewsInput, placesSearch);
      return { text: r.text, placeIds: r.placeId ? [r.placeId] : [] };
    }
    case 'check_appointment_availability': {
      const r = await checkAppointmentAvailability(input as unknown as CheckAppointmentAvailabilityInput, placesSearch);
      return { text: r.text, placeIds: r.placeId ? [r.placeId] : [] };
    }
    case 'get_promotion': {
      const r = await getPromotion(input as unknown as GetPromotionInput, placesSearch);
      return { text: r.text, placeIds: r.placeIds };
    }
    default: {
      const _exhaustive: never = name;
      return { text: `أداة غير معروفة: ${String(_exhaustive)}` };
    }
  }
}
