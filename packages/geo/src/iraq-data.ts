/**
 * Comprehensive Iraqi geographic reference data.
 * Coordinates are WGS84 [lng, lat]. Bounding boxes are [minLon, minLat, maxLon, maxLat].
 * Population figures are approximate (2023 estimates).
 * Data marked UNCERTAIN should be verified against authoritative sources.
 */

import type { BBox, LngLat } from '@iraq-maps/contracts';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Region = 'north' | 'center' | 'south' | 'kurdistan';

export interface Governorate {
  /** ISO 3166-2:IQ code e.g. "IQ-BA" */
  iso: string;
  nameAr: string;
  nameKu: string;
  nameEn: string;
  capitalAr: string;
  capitalEn: string;
  /** approximate 2023 estimate */
  population: number;
  /** km² */
  areaSqKm: number;
  bbox: BBox;
  center: LngLat;
  region: Region;
}

export interface City {
  nameAr: string;
  nameKu: string;
  nameEn: string;
  governorateIso: string;
  /** approximate 2023 estimate */
  population: number;
  center: LngLat;
  isGovernorateCapital: boolean;
  isCountryCapital: boolean;
}

export type NeighborhoodType = 'residential' | 'commercial' | 'mixed' | 'historical';

export interface BaghdadNeighborhood {
  nameAr: string;
  nameEn: string;
  district: string;
  bbox: BBox;
  type: NeighborhoodType;
}

export type LandmarkType =
  | 'mosque'
  | 'shrine'
  | 'historical'
  | 'museum'
  | 'natural'
  | 'monument'
  | 'bridge'
  | 'university'
  | 'market'
  | 'government';

export interface Landmark {
  nameAr: string;
  nameEn: string;
  type: LandmarkType;
  coordinates: LngLat;
  descriptionAr: string;
  descriptionEn: string;
  /** UNESCO World Heritage status if applicable */
  unescoStatus?: 'inscribed' | 'tentative';
  governorateIso: string;
}

export interface PoiCategory {
  nameAr: string;
  nameEn: string;
  nameKu: string;
  /** OSM primary tag key */
  osmKey: string;
  /** OSM primary tag value */
  osmValue: string;
  /** Additional OSM tags for filtering */
  osmTags?: Record<string, string>;
  /** Icon identifier (Maki / custom) */
  icon: string;
}

// ─── Governorates ─────────────────────────────────────────────────────────────

export const GOVERNORATES: readonly Governorate[] = [
  {
    iso: 'IQ-BG',
    nameAr: 'بغداد',
    nameKu: 'بەغدا',
    nameEn: 'Baghdad',
    capitalAr: 'بغداد',
    capitalEn: 'Baghdad',
    population: 8_765_000,
    areaSqKm: 4_555,
    bbox: [44.06, 33.09, 44.65, 33.55],
    center: [44.361, 33.315],
    region: 'center',
  },
  {
    iso: 'IQ-BA',
    nameAr: 'البصرة',
    nameKu: 'بەسرە',
    nameEn: 'Basra',
    capitalAr: 'البصرة',
    capitalEn: 'Basra',
    population: 3_406_000,
    areaSqKm: 19_070,
    bbox: [47.04, 29.61, 48.76, 31.54],
    center: [47.783, 30.508],
    region: 'south',
  },
  {
    iso: 'IQ-NI',
    nameAr: 'نينوى',
    nameKu: 'نینەوا',
    nameEn: 'Ninewa',
    capitalAr: 'الموصل',
    capitalEn: 'Mosul',
    population: 3_360_000,
    areaSqKm: 37_323,
    bbox: [41.78, 35.58, 43.72, 37.38],
    center: [42.779, 36.488],
    region: 'north',
  },
  {
    iso: 'IQ-AR',
    nameAr: 'أربيل',
    nameKu: 'هەولێر',
    nameEn: 'Erbil',
    capitalAr: 'أربيل',
    capitalEn: 'Erbil',
    population: 2_254_000,
    areaSqKm: 14_872,
    bbox: [43.40, 35.70, 45.32, 37.22],
    center: [44.009, 36.191],
    region: 'kurdistan',
  },
  {
    iso: 'IQ-SU',
    nameAr: 'السليمانية',
    nameKu: 'سلێمانی',
    nameEn: 'Sulaymaniyah',
    capitalAr: 'السليمانية',
    capitalEn: 'Sulaymaniyah',
    population: 2_080_000,
    areaSqKm: 17_023,
    bbox: [44.53, 34.65, 46.57, 36.55],
    center: [45.441, 35.560],
    region: 'kurdistan',
  },
  {
    iso: 'IQ-DA',
    nameAr: 'دهوك',
    nameKu: 'دهۆک',
    nameEn: 'Dohuk',
    capitalAr: 'دهوك',
    capitalEn: 'Dohuk',
    population: 1_292_000,
    areaSqKm: 10_920,
    bbox: [42.48, 36.61, 43.82, 37.38],
    center: [43.004, 37.008],
    region: 'kurdistan',
  },
  {
    iso: 'IQ-KI',
    nameAr: 'كركوك',
    nameKu: 'کەرکووک',
    nameEn: 'Kirkuk',
    capitalAr: 'كركوك',
    capitalEn: 'Kirkuk',
    population: 1_597_000,
    areaSqKm: 9_679,
    bbox: [43.36, 34.82, 44.89, 36.06],
    center: [44.396, 35.468],
    region: 'north',
  },
  {
    iso: 'IQ-AN',
    nameAr: 'الأنبار',
    nameKu: 'ئەنبار',
    nameEn: 'Anbar',
    capitalAr: 'الرمادي',
    capitalEn: 'Ramadi',
    population: 1_878_000,
    areaSqKm: 138_501,
    bbox: [38.79, 29.08, 46.35, 34.73],
    center: [41.930, 32.455],
    region: 'center',
  },
  {
    iso: 'IQ-BB',
    nameAr: 'بابل',
    nameKu: 'بابل',
    nameEn: 'Babil',
    capitalAr: 'الحلة',
    capitalEn: 'Hillah',
    population: 2_218_000,
    areaSqKm: 5_603,
    bbox: [44.01, 32.26, 45.03, 33.01],
    center: [44.443, 32.478],
    region: 'center',
  },
  {
    iso: 'IQ-KA',
    nameAr: 'كربلاء',
    nameKu: 'کەربەلا',
    nameEn: 'Karbala',
    capitalAr: 'كربلاء',
    capitalEn: 'Karbala',
    population: 1_246_000,
    areaSqKm: 5_034,
    bbox: [43.68, 32.27, 44.35, 32.90],
    center: [44.024, 32.616],
    region: 'center',
  },
  {
    iso: 'IQ-NA',
    nameAr: 'النجف',
    nameKu: 'نەجەف',
    nameEn: 'Najaf',
    capitalAr: 'النجف',
    capitalEn: 'Najaf',
    population: 1_465_000,
    areaSqKm: 28_824,
    bbox: [43.57, 29.91, 45.00, 32.27],
    center: [44.346, 31.995],
    region: 'center',
  },
  {
    iso: 'IQ-WA',
    nameAr: 'واسط',
    nameKu: 'واسط',
    nameEn: 'Wasit',
    capitalAr: 'الكوت',
    capitalEn: 'Kut',
    population: 1_368_000,
    areaSqKm: 17_153,
    bbox: [44.89, 32.26, 46.71, 33.75],
    center: [45.821, 32.501],
    region: 'center',
  },
  {
    iso: 'IQ-DQ',
    nameAr: 'ذي قار',
    nameKu: 'زی قار',
    nameEn: 'Dhi Qar',
    capitalAr: 'الناصرية',
    capitalEn: 'Nasiriyah',
    population: 1_985_000,
    areaSqKm: 12_900,
    bbox: [45.56, 30.49, 47.21, 32.25],
    center: [46.258, 31.000],
    region: 'south',
  },
  {
    iso: 'IQ-MU',
    nameAr: 'المثنى',
    nameKu: 'مەسەنێ',
    nameEn: 'Muthanna',
    capitalAr: 'السماوة',
    capitalEn: 'Samawah',
    population: 905_000,
    areaSqKm: 51_740,
    bbox: [43.75, 29.44, 46.12, 31.95],
    center: [45.290, 30.513],
    region: 'south',
  },
  {
    iso: 'IQ-QA',
    nameAr: 'القادسية',
    nameKu: 'قادیسیە',
    nameEn: 'Qadisiyyah',
    capitalAr: 'الديوانية',
    capitalEn: 'Diwaniyah',
    population: 1_385_000,
    areaSqKm: 8_153,
    bbox: [44.27, 31.46, 45.50, 32.73],
    center: [44.924, 31.993],
    region: 'center',
  },
  {
    iso: 'IQ-MA',
    nameAr: 'ميسان',
    nameKu: 'مێسان',
    nameEn: 'Maysan',
    capitalAr: 'العمارة',
    capitalEn: 'Amarah',
    population: 1_040_000,
    areaSqKm: 16_072,
    bbox: [46.17, 31.34, 47.97, 32.95],
    center: [47.157, 31.843],
    region: 'south',
  },
  {
    iso: 'IQ-DI',
    nameAr: 'ديالى',
    nameKu: 'دیالە',
    nameEn: 'Diyala',
    capitalAr: 'بعقوبة',
    capitalEn: 'Baqubah',
    population: 1_699_000,
    areaSqKm: 17_685,
    bbox: [44.64, 33.55, 46.23, 35.03],
    center: [45.389, 33.745],
    region: 'center',
  },
  {
    iso: 'IQ-SD',
    nameAr: 'صلاح الدين',
    nameKu: 'سەلاحەددین',
    nameEn: 'Salah al-Din',
    capitalAr: 'تكريت',
    capitalEn: 'Tikrit',
    population: 1_564_000,
    areaSqKm: 24_751,
    bbox: [42.73, 33.54, 45.10, 35.59],
    center: [43.689, 34.601],
    region: 'north',
  },
] as const;

// ─── Major Cities ─────────────────────────────────────────────────────────────

export const MAJOR_CITIES: readonly City[] = [
  // Baghdad governorate
  { nameAr: 'بغداد', nameKu: 'بەغدا', nameEn: 'Baghdad', governorateIso: 'IQ-BG', population: 7_200_000, center: [44.361, 33.315], isGovernorateCapital: true, isCountryCapital: true },
  { nameAr: 'المحمودية', nameKu: 'مەحمودیە', nameEn: 'Mahmoudiyah', governorateIso: 'IQ-BG', population: 220_000, center: [44.398, 33.065], isGovernorateCapital: false, isCountryCapital: false },

  // Basra governorate
  { nameAr: 'البصرة', nameKu: 'بەسرە', nameEn: 'Basra', governorateIso: 'IQ-BA', population: 2_750_000, center: [47.783, 30.508], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'أبو الخصيب', nameKu: 'ئەبولخەسیب', nameEn: 'Abu al-Khaseeb', governorateIso: 'IQ-BA', population: 390_000, center: [47.982, 30.423], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'الزبير', nameKu: 'زوبێر', nameEn: 'Zubair', governorateIso: 'IQ-BA', population: 315_000, center: [47.694, 30.383], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'القرنة', nameKu: 'قورنە', nameEn: 'Qurna', governorateIso: 'IQ-BA', population: 120_000, center: [47.430, 31.004], isGovernorateCapital: false, isCountryCapital: false },

  // Ninewa governorate
  { nameAr: 'الموصل', nameKu: 'مووسڵ', nameEn: 'Mosul', governorateIso: 'IQ-NI', population: 1_800_000, center: [43.137, 36.340], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'تلعفر', nameKu: 'تەلعەفەر', nameEn: 'Tal Afar', governorateIso: 'IQ-NI', population: 250_000, center: [42.449, 36.374], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'سنجار', nameKu: 'شنگال', nameEn: 'Sinjar', governorateIso: 'IQ-NI', population: 85_000, center: [41.867, 36.325], isGovernorateCapital: false, isCountryCapital: false },

  // Erbil governorate
  { nameAr: 'أربيل', nameKu: 'هەولێر', nameEn: 'Erbil', governorateIso: 'IQ-AR', population: 1_700_000, center: [44.009, 36.191], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'رانية', nameKu: 'ڕانیە', nameEn: 'Rania', governorateIso: 'IQ-AR', population: 150_000, center: [44.713, 36.262], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'شقلاوة', nameKu: 'شەقڵاوە', nameEn: 'Shaqlawa', governorateIso: 'IQ-AR', population: 45_000, center: [44.319, 36.407], isGovernorateCapital: false, isCountryCapital: false },

  // Sulaymaniyah governorate
  { nameAr: 'السليمانية', nameKu: 'سلێمانی', nameEn: 'Sulaymaniyah', governorateIso: 'IQ-SU', population: 1_100_000, center: [45.441, 35.560], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'حلبجة', nameKu: 'هەڵەبجە', nameEn: 'Halabja', governorateIso: 'IQ-SU', population: 110_000, center: [45.986, 35.176], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'كفري', nameKu: 'کەفری', nameEn: 'Kefri', governorateIso: 'IQ-SU', population: 60_000, center: [44.644, 34.694], isGovernorateCapital: false, isCountryCapital: false },

  // Dohuk governorate
  { nameAr: 'دهوك', nameKu: 'دهۆک', nameEn: 'Dohuk', governorateIso: 'IQ-DA', population: 500_000, center: [43.004, 37.008], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'زاخو', nameKu: 'زاخۆ', nameEn: 'Zakho', governorateIso: 'IQ-DA', population: 280_000, center: [42.682, 37.143], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'عقرة', nameKu: 'عەقرێ', nameEn: 'Aqrah', governorateIso: 'IQ-DA', population: 95_000, center: [43.896, 36.740], isGovernorateCapital: false, isCountryCapital: false },

  // Kirkuk governorate
  { nameAr: 'كركوك', nameKu: 'کەرکووک', nameEn: 'Kirkuk', governorateIso: 'IQ-KI', population: 1_100_000, center: [44.396, 35.468], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'الحويجة', nameKu: 'هووێجە', nameEn: 'Hawija', governorateIso: 'IQ-KI', population: 180_000, center: [43.841, 35.355], isGovernorateCapital: false, isCountryCapital: false },

  // Anbar governorate
  { nameAr: 'الرمادي', nameKu: 'ڕەمادی', nameEn: 'Ramadi', governorateIso: 'IQ-AN', population: 680_000, center: [43.307, 33.426], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'الفلوجة', nameKu: 'فەلووجە', nameEn: 'Fallujah', governorateIso: 'IQ-AN', population: 550_000, center: [43.789, 33.350], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'هيت', nameKu: 'هیت', nameEn: 'Hit', governorateIso: 'IQ-AN', population: 150_000, center: [42.830, 33.643], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'القائم', nameKu: 'قائم', nameEn: 'Al-Qaim', governorateIso: 'IQ-AN', population: 140_000, center: [41.101, 34.377], isGovernorateCapital: false, isCountryCapital: false },

  // Babil governorate
  { nameAr: 'الحلة', nameKu: 'حیلە', nameEn: 'Hillah', governorateIso: 'IQ-BB', population: 700_000, center: [44.443, 32.478], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'المحاويل', nameKu: 'مەحاویل', nameEn: 'Mahawil', governorateIso: 'IQ-BB', population: 130_000, center: [44.605, 32.726], isGovernorateCapital: false, isCountryCapital: false },

  // Karbala governorate
  { nameAr: 'كربلاء', nameKu: 'کەربەلا', nameEn: 'Karbala', governorateIso: 'IQ-KA', population: 750_000, center: [44.024, 32.616], isGovernorateCapital: true, isCountryCapital: false },

  // Najaf governorate
  { nameAr: 'النجف', nameKu: 'نەجەف', nameEn: 'Najaf', governorateIso: 'IQ-NA', population: 900_000, center: [44.346, 31.995], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'الكوفة', nameKu: 'کووفە', nameEn: 'Kufa', governorateIso: 'IQ-NA', population: 150_000, center: [44.401, 32.031], isGovernorateCapital: false, isCountryCapital: false },

  // Wasit governorate
  { nameAr: 'الكوت', nameKu: 'کووت', nameEn: 'Kut', governorateIso: 'IQ-WA', population: 520_000, center: [45.821, 32.501], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'النعمانية', nameKu: 'نوعمانیە', nameEn: 'Numaniyah', governorateIso: 'IQ-WA', population: 100_000, center: [45.336, 32.542], isGovernorateCapital: false, isCountryCapital: false },

  // Dhi Qar governorate
  { nameAr: 'الناصرية', nameKu: 'ناسریە', nameEn: 'Nasiriyah', governorateIso: 'IQ-DQ', population: 800_000, center: [46.258, 31.000], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'الشطرة', nameKu: 'شەترە', nameEn: 'Shatra', governorateIso: 'IQ-DQ', population: 200_000, center: [46.173, 31.416], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'سوق الشيوخ', nameKu: 'سووقەشیووخ', nameEn: 'Suq al-Shuyukh', governorateIso: 'IQ-DQ', population: 150_000, center: [46.466, 30.685], isGovernorateCapital: false, isCountryCapital: false },

  // Muthanna governorate
  { nameAr: 'السماوة', nameKu: 'سەماوە', nameEn: 'Samawah', governorateIso: 'IQ-MU', population: 350_000, center: [45.291, 31.321], isGovernorateCapital: true, isCountryCapital: false },

  // Qadisiyyah governorate
  { nameAr: 'الديوانية', nameKu: 'دیوانیە', nameEn: 'Diwaniyah', governorateIso: 'IQ-QA', population: 530_000, center: [44.924, 31.993], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'الشامية', nameKu: 'شامیە', nameEn: 'Shamiyah', governorateIso: 'IQ-QA', population: 90_000, center: [44.598, 31.969], isGovernorateCapital: false, isCountryCapital: false },

  // Maysan governorate
  { nameAr: 'العمارة', nameKu: 'عەمارە', nameEn: 'Amarah', governorateIso: 'IQ-MA', population: 500_000, center: [47.157, 31.843], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'علي الغربي', nameKu: 'علی غەربی', nameEn: 'Ali al-Gharbi', governorateIso: 'IQ-MA', population: 90_000, center: [46.692, 32.471], isGovernorateCapital: false, isCountryCapital: false },

  // Diyala governorate
  { nameAr: 'بعقوبة', nameKu: 'بەعقووبە', nameEn: 'Baqubah', governorateIso: 'IQ-DI', population: 600_000, center: [44.650, 33.748], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'خانقين', nameKu: 'خانەقین', nameEn: 'Khanaqin', governorateIso: 'IQ-DI', population: 170_000, center: [45.373, 34.347], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'المقدادية', nameKu: 'مەقدادیە', nameEn: 'Muqdadiyah', governorateIso: 'IQ-DI', population: 220_000, center: [44.928, 33.980], isGovernorateCapital: false, isCountryCapital: false },

  // Salah al-Din governorate
  { nameAr: 'تكريت', nameKu: 'تیکریت', nameEn: 'Tikrit', governorateIso: 'IQ-SD', population: 260_000, center: [43.692, 34.609], isGovernorateCapital: true, isCountryCapital: false },
  { nameAr: 'سامراء', nameKu: 'سامەرا', nameEn: 'Samarra', governorateIso: 'IQ-SD', population: 350_000, center: [43.874, 34.198], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'بيجي', nameKu: 'بێجی', nameEn: 'Baiji', governorateIso: 'IQ-SD', population: 180_000, center: [43.488, 34.928], isGovernorateCapital: false, isCountryCapital: false },
  { nameAr: 'بلد', nameKu: 'بەلەد', nameEn: 'Balad', governorateIso: 'IQ-SD', population: 130_000, center: [43.961, 33.990], isGovernorateCapital: false, isCountryCapital: false },
] as const;

// ─── Baghdad Neighborhoods ────────────────────────────────────────────────────

export const BAGHDAD_NEIGHBORHOODS: readonly BaghdadNeighborhood[] = [
  // Karkh (West Baghdad) districts
  { nameAr: 'المنصور', nameEn: 'Mansour', district: 'Karkh', bbox: [44.275, 33.310, 44.355, 33.365], type: 'mixed' },
  { nameAr: 'الكرادة الغربية', nameEn: 'Karrada Gharbi', district: 'Karkh', bbox: [44.350, 33.295, 44.410, 33.330], type: 'commercial' },
  { nameAr: 'العلاوي', nameEn: 'Allawi', district: 'Karkh', bbox: [44.355, 33.325, 44.390, 33.350], type: 'commercial' },
  { nameAr: 'الكاظمية', nameEn: 'Kadhimiyah', district: 'Adhamiyah-Kadhimiyah', bbox: [44.320, 33.375, 44.390, 33.415], type: 'historical' },
  { nameAr: 'أبو غريب', nameEn: 'Abu Ghraib', district: 'Karkh', bbox: [44.040, 33.240, 44.130, 33.310], type: 'residential' },
  { nameAr: 'الحرية', nameEn: 'Huriyah', district: 'Karkh', bbox: [44.270, 33.355, 44.320, 33.395], type: 'residential' },
  { nameAr: 'الشعلة', nameEn: 'Shula', district: 'Karkh', bbox: [44.265, 33.385, 44.320, 33.435], type: 'residential' },
  { nameAr: 'العامرية', nameEn: 'Ameriyah', district: 'Karkh', bbox: [44.210, 33.295, 44.270, 33.345], type: 'residential' },
  { nameAr: 'الغزالية', nameEn: 'Ghazaliyah', district: 'Karkh', bbox: [44.230, 33.340, 44.280, 33.390], type: 'residential' },
  { nameAr: 'اليرموك', nameEn: 'Yarmouk', district: 'Karkh', bbox: [44.280, 33.320, 44.335, 33.360], type: 'residential' },
  { nameAr: 'الدورة', nameEn: 'Doura', district: 'Karkh', bbox: [44.340, 33.220, 44.420, 33.280], type: 'mixed' },
  { nameAr: 'العبيدي', nameEn: 'Ubaidi', district: 'Karkh', bbox: [44.440, 33.280, 44.490, 33.320], type: 'residential' },
  { nameAr: 'المشتل', nameEn: 'Mushtaq', district: 'Karkh', bbox: [44.290, 33.280, 44.340, 33.320], type: 'residential' },
  { nameAr: 'جميلة', nameEn: 'Jamila', district: 'Karkh', bbox: [44.405, 33.345, 44.445, 33.380], type: 'commercial' },
  { nameAr: 'بغداد الجديدة', nameEn: 'New Baghdad', district: 'Rusafa', bbox: [44.480, 33.295, 44.540, 33.330], type: 'residential' },

  // Rusafa (East Baghdad) districts
  { nameAr: 'الكرادة', nameEn: 'Karrada', district: 'Rusafa', bbox: [44.370, 33.285, 44.450, 33.340], type: 'commercial' },
  { nameAr: 'الكرادة الداخلية', nameEn: 'Karrada Dakhil', district: 'Rusafa', bbox: [44.390, 33.290, 44.440, 33.320], type: 'commercial' },
  { nameAr: 'الزعفرانية', nameEn: 'Zafaraniyah', district: 'Rusafa', bbox: [44.460, 33.240, 44.540, 33.295], type: 'mixed' },
  { nameAr: 'الأعظمية', nameEn: 'Adhamiyah', district: 'Adhamiyah-Kadhimiyah', bbox: [44.360, 33.355, 44.430, 33.410], type: 'historical' },
  { nameAr: 'الشماسية', nameEn: 'Shamasiyah', district: 'Rusafa', bbox: [44.420, 33.340, 44.470, 33.380], type: 'residential' },
  { nameAr: 'الوزيرية', nameEn: 'Waziriyah', district: 'Rusafa', bbox: [44.390, 33.350, 44.440, 33.385], type: 'mixed' },
  { nameAr: 'المدينة الطبية', nameEn: 'Medical City', district: 'Rusafa', bbox: [44.420, 33.330, 44.455, 33.360], type: 'mixed' },
  { nameAr: 'الحارثية', nameEn: 'Harithiyah', district: 'Rusafa', bbox: [44.335, 33.355, 44.380, 33.390], type: 'residential' },
  { nameAr: 'الزيونة', nameEn: 'Zayouna', district: 'Rusafa', bbox: [44.460, 33.315, 44.510, 33.355], type: 'residential' },
  { nameAr: 'الجادرية', nameEn: 'Jadiriyah', district: 'Rusafa', bbox: [44.370, 33.265, 44.415, 33.300], type: 'mixed' },
  { nameAr: 'المعقل', nameEn: 'Maqal', district: 'Rusafa', bbox: [44.315, 33.270, 44.365, 33.305], type: 'residential' },
  { nameAr: 'الكسرة', nameEn: 'Kasra', district: 'Rusafa', bbox: [44.510, 33.310, 44.560, 33.350], type: 'residential' },
  { nameAr: 'الحسينية', nameEn: 'Hussainiyah', district: 'Rusafa', bbox: [44.390, 33.415, 44.450, 33.460], type: 'residential' },
  { nameAr: 'الشعب', nameEn: 'Shaab', district: 'Rusafa', bbox: [44.385, 33.390, 44.435, 33.430], type: 'residential' },
  { nameAr: 'فلسطين', nameEn: 'Palestine St. Area', district: 'Rusafa', bbox: [44.415, 33.345, 44.460, 33.375], type: 'commercial' },
  { nameAr: 'النهضة', nameEn: 'Nahdha', district: 'Rusafa', bbox: [44.445, 33.345, 44.490, 33.380], type: 'residential' },
  { nameAr: 'السيدية', nameEn: 'Saydiyah', district: 'Karkh', bbox: [44.310, 33.255, 44.365, 33.295], type: 'residential' },
  { nameAr: 'عرصات الهندية', nameEn: 'Arasat al-Hindiyah', district: 'Rusafa', bbox: [44.370, 33.295, 44.415, 33.325], type: 'commercial' },
  { nameAr: 'التضامن', nameEn: 'Tadhamun', district: 'Rusafa', bbox: [44.445, 33.275, 44.495, 33.320], type: 'residential' },
  { nameAr: 'البياع', nameEn: 'Bayaa', district: 'Karkh', bbox: [44.275, 33.280, 44.325, 33.315], type: 'residential' },
  { nameAr: 'الجهاد', nameEn: 'Jihad', district: 'Karkh', bbox: [44.255, 33.310, 44.295, 33.355], type: 'residential' },
  { nameAr: 'الكرخ', nameEn: 'Karkh', district: 'Karkh', bbox: [44.360, 33.335, 44.400, 33.370], type: 'historical' },
  { nameAr: 'الرصافة', nameEn: 'Rusafa', district: 'Rusafa', bbox: [44.400, 33.335, 44.440, 33.365], type: 'historical' },
  { nameAr: 'الباب الشرقي', nameEn: 'Bab al-Sharqi', district: 'Rusafa', bbox: [44.405, 33.325, 44.440, 33.350], type: 'commercial' },
  { nameAr: 'الصليخ', nameEn: 'Suleikh', district: 'Rusafa', bbox: [44.400, 33.420, 44.450, 33.460], type: 'residential' },
  { nameAr: 'المشتل (الكرخ)', nameEn: 'Mushtaq (Karkh)', district: 'Karkh', bbox: [44.255, 33.355, 44.295, 33.390], type: 'residential' },
  { nameAr: 'الإسكان', nameEn: 'Iskan', district: 'Karkh', bbox: [44.240, 33.330, 44.275, 33.360], type: 'residential' },
  { nameAr: 'الشرطة', nameEn: 'Shurta', district: 'Karkh', bbox: [44.290, 33.340, 44.330, 33.370], type: 'residential' },
  { nameAr: 'صدر سيتي (مدينة الصدر)', nameEn: 'Sadr City', district: 'Rusafa', bbox: [44.460, 33.355, 44.540, 33.410], type: 'residential' },
  { nameAr: 'النزال', nameEn: 'Nazzal', district: 'Karkh', bbox: [44.300, 33.300, 44.340, 33.330], type: 'residential' },
  { nameAr: 'القاهرة', nameEn: 'Cairo', district: 'Rusafa', bbox: [44.370, 33.360, 44.410, 33.395], type: 'mixed' },
  { nameAr: 'حي العدل', nameEn: 'Adl', district: 'Karkh', bbox: [44.265, 33.365, 44.305, 33.400], type: 'residential' },
] as const;

// ─── Landmarks ────────────────────────────────────────────────────────────────

export const LANDMARKS: readonly Landmark[] = [
  // Baghdad landmarks
  {
    nameAr: 'المنطقة الخضراء (المنطقة الدولية)',
    nameEn: 'Green Zone (International Zone)',
    type: 'government',
    coordinates: [44.392, 33.311],
    descriptionAr: 'المنطقة المحصنة في قلب بغداد تضم السفارات والمباني الحكومية الرئيسية',
    descriptionEn: 'Fortified area in central Baghdad housing embassies and key government buildings',
    governorateIso: 'IQ-BG',
  },
  {
    nameAr: 'جامع أبو حنيفة النعمان',
    nameEn: 'Abu Hanifa Mosque',
    type: 'mosque',
    coordinates: [44.362, 33.380],
    descriptionAr: 'من أشهر المساجد في العراق، يضم ضريح الإمام أبي حنيفة في الأعظمية',
    descriptionEn: 'One of Iraq\'s most famous mosques, housing the shrine of Imam Abu Hanifa in Adhamiyah',
    governorateIso: 'IQ-BG',
  },
  {
    nameAr: 'جامع الإمام الكاظم',
    nameEn: 'Imam Kadhim Shrine',
    type: 'shrine',
    coordinates: [44.338, 33.386],
    descriptionAr: 'أحد أبرز المراقد الشيعية في العراق، ضريح الإمام موسى الكاظم في الكاظمية',
    descriptionEn: 'One of Iraq\'s most important Shia shrines, mausoleum of Imam Musa al-Kadhim in Kadhimiyah',
    governorateIso: 'IQ-BG',
  },
  {
    nameAr: 'متحف العراق الوطني',
    nameEn: 'Iraq Museum',
    type: 'museum',
    coordinates: [44.384, 33.344],
    descriptionAr: 'يضم مجموعة من أعظم الآثار في العالم تمتد من حضارة سومر وبابل وآشور',
    descriptionEn: 'Houses one of the world\'s greatest collections of antiquities spanning Sumerian, Babylonian and Assyrian civilizations',
    governorateIso: 'IQ-BG',
  },
  {
    nameAr: 'قوس النصر',
    nameEn: 'Crossed Swords (Victory Arch)',
    type: 'monument',
    coordinates: [44.397, 33.308],
    descriptionAr: 'نصب تذكاري ضخم يتكون من سيفين متقاطعين بني عام 1989',
    descriptionEn: 'Massive monument of two crossed swords built in 1989, located on the ceremonial parade ground',
    governorateIso: 'IQ-BG',
  },
  {
    nameAr: 'نصب الشهيد',
    nameEn: 'Martyrs\' Monument',
    type: 'monument',
    coordinates: [44.428, 33.339],
    descriptionAr: 'نصب تذكاري للجنود العراقيين الذين سقطوا في الحرب العراقية الإيرانية (1980–1988)',
    descriptionEn: 'Memorial for Iraqi soldiers who fell in the Iran–Iraq War (1980–1988), designed by Ismail Fatah al-Turk',
    governorateIso: 'IQ-BG',
  },
  {
    nameAr: 'جسر الجمهورية',
    nameEn: 'Jumhuriyah Bridge',
    type: 'bridge',
    coordinates: [44.385, 33.335],
    descriptionAr: 'أحد أقدم الجسور التي تربط ضفتي بغداد على نهر دجلة',
    descriptionEn: 'One of the oldest bridges connecting both sides of Baghdad across the Tigris',
    governorateIso: 'IQ-BG',
  },
  {
    nameAr: 'الجامعة المستنصرية',
    nameEn: 'Al-Mustansiriyah University',
    type: 'historical',
    coordinates: [44.405, 33.345],
    descriptionAr: 'جامعة تاريخية بنيت عام 1227م تعدّ من أوائل الجامعات في العالم',
    descriptionEn: 'Historic university founded in 1227 AD, considered one of the world\'s first universities',
    unescoStatus: 'tentative',
    governorateIso: 'IQ-BG',
  },
  {
    nameAr: 'سوق الصفافير',
    nameEn: 'Coppersmith Bazaar (Souk al-Safafeer)',
    type: 'market',
    coordinates: [44.406, 33.342],
    descriptionAr: 'سوق تاريخي للنحاسيات والمشغولات المعدنية التقليدية في قلب بغداد القديمة',
    descriptionEn: 'Historic market for copper and traditional metalwork in the heart of old Baghdad',
    governorateIso: 'IQ-BG',
  },
  {
    nameAr: 'شارع المتنبي',
    nameEn: 'Al-Mutanabbi Street',
    type: 'historical',
    coordinates: [44.402, 33.340],
    descriptionAr: 'شارع الكتب والمثقفين الأشهر في بغداد، سمي باسم الشاعر العربي الكبير',
    descriptionEn: 'Baghdad\'s most famous street for books and intellectuals, named after the great Arab poet al-Mutanabbi',
    governorateIso: 'IQ-BG',
  },

  // Karbala landmarks
  {
    nameAr: 'مرقد الإمام الحسين',
    nameEn: 'Imam Hussein Shrine',
    type: 'shrine',
    coordinates: [44.031, 32.616],
    descriptionAr: 'من أقدس المزارات الإسلامية في العالم، حيث يرقد الإمام الحسين بن علي',
    descriptionEn: 'One of the holiest sites in Islam, where Imam Hussein ibn Ali is buried',
    governorateIso: 'IQ-KA',
  },
  {
    nameAr: 'مرقد الإمام العباس',
    nameEn: 'Imam Abbas Shrine',
    type: 'shrine',
    coordinates: [44.032, 32.619],
    descriptionAr: 'ضريح العباس بن علي أخي الإمام الحسين، قريب من مرقد الإمام الحسين',
    descriptionEn: 'Mausoleum of Abbas ibn Ali, brother of Imam Hussein, near the Husayn shrine',
    governorateIso: 'IQ-KA',
  },

  // Najaf landmarks
  {
    nameAr: 'مرقد الإمام علي بن أبي طالب',
    nameEn: 'Imam Ali Shrine',
    type: 'shrine',
    coordinates: [44.317, 32.003],
    descriptionAr: 'أحد أقدس الأماكن في الإسلام الشيعي، ضريح الإمام علي بن أبي طالب',
    descriptionEn: 'One of the holiest sites in Shia Islam, shrine of Imam Ali ibn Abi Talib',
    governorateIso: 'IQ-NA',
  },
  {
    nameAr: 'وادي السلام',
    nameEn: 'Wadi al-Salam Cemetery',
    type: 'historical',
    coordinates: [44.310, 32.010],
    descriptionAr: 'أكبر مقبرة في العالم، تحتوي على ملايين القبور تمتد لأكثر من 1400 عام',
    descriptionEn: 'The world\'s largest cemetery, containing millions of graves spanning over 1,400 years',
    governorateIso: 'IQ-NA',
  },

  // Samarra landmarks
  {
    nameAr: 'ملوية سامراء',
    nameEn: 'Great Mosque of Samarra (Malwiya Minaret)',
    type: 'historical',
    coordinates: [43.874, 34.209],
    descriptionAr: 'المئذنة الحلزونية الشهيرة المبنية عام 848م، من أبرز التحف الإسلامية',
    descriptionEn: 'Famous spiral minaret built in 848 AD, one of the most remarkable monuments of Islamic architecture',
    unescoStatus: 'inscribed',
    governorateIso: 'IQ-SD',
  },
  {
    nameAr: 'مرقد الإمام العسكري',
    nameEn: 'Al-Askari Shrine',
    type: 'shrine',
    coordinates: [43.873, 34.198],
    descriptionAr: 'ضريح الإمامين العسكريين في سامراء، من أقدس المراقد الشيعية',
    descriptionEn: 'Shrine of the two Askari Imams in Samarra, one of the holiest Shia shrines',
    governorateIso: 'IQ-SD',
  },

  // Babil / Hillah landmarks
  {
    nameAr: 'بابل الأثرية',
    nameEn: 'Ancient Babylon',
    type: 'historical',
    coordinates: [44.421, 32.542],
    descriptionAr: 'موقع مدينة بابل القديمة، حضارة ما بين النهرين، يضم بقايا أسوار المدينة وبوابة عشتار',
    descriptionEn: 'Site of ancient Babylon, Mesopotamian civilization, with remains of city walls and the Ishtar Gate replica',
    unescoStatus: 'inscribed',
    governorateIso: 'IQ-BB',
  },
  {
    nameAr: 'برج بابل (زقورة بابل)',
    nameEn: 'Babylon Tower (Ziggurat)',
    type: 'historical',
    coordinates: [44.420, 32.537],
    descriptionAr: 'أساسات زقورة بابل الكبرى التي يعتقد أنها أساس برج بابل',
    descriptionEn: 'Foundations of the great ziggurat of Babylon, believed by some to be the basis of the Tower of Babel legend',
    governorateIso: 'IQ-BB',
  },

  // Dhi Qar / Nasiriyah landmarks
  {
    nameAr: 'أور (مدينة أور الأثرية)',
    nameEn: 'Ur (Ancient City of Ur)',
    type: 'historical',
    coordinates: [46.104, 30.961],
    descriptionAr: 'إحدى أقدم مدن العالم في حضارة السومريين، تضم زقورة أور المحفوظة جيداً',
    descriptionEn: 'One of the world\'s oldest cities of the Sumerian civilization, with the well-preserved Ziggurat of Ur',
    unescoStatus: 'tentative',
    governorateIso: 'IQ-DQ',
  },
  {
    nameAr: 'زقورة أور',
    nameEn: 'Ziggurat of Ur',
    type: 'historical',
    coordinates: [46.103, 30.962],
    descriptionAr: 'زقورة سومرية بنيت في القرن الحادي والعشرين قبل الميلاد، من أفضل المحفوظة في العراق',
    descriptionEn: 'Sumerian ziggurat built in the 21st century BC, one of the best-preserved in Iraq',
    unescoStatus: 'tentative',
    governorateIso: 'IQ-DQ',
  },

  // Mosul / Ninewa landmarks
  {
    nameAr: 'الموصل القديمة (المدينة القديمة)',
    nameEn: 'Old Mosul (al-Mawsil al-Qadimah)',
    type: 'historical',
    coordinates: [43.133, 36.340],
    descriptionAr: 'المدينة التاريخية القديمة للموصل على الضفة الغربية لنهر دجلة',
    descriptionEn: 'Historic old city of Mosul on the west bank of the Tigris, undergoing reconstruction',
    governorateIso: 'IQ-NI',
  },
  {
    nameAr: 'نينوى الأثرية',
    nameEn: 'Ancient Nineveh',
    type: 'historical',
    coordinates: [43.155, 36.360],
    descriptionAr: 'عاصمة الإمبراطورية الآشورية القديمة، تضم تلال كويونجيق وآثار قصر سنحاريب',
    descriptionEn: 'Capital of the ancient Assyrian Empire, site of Kuyunjik mound and ruins of Sennacherib\'s palace',
    unescoStatus: 'tentative',
    governorateIso: 'IQ-NI',
  },
  {
    nameAr: 'الحضر',
    nameEn: 'Hatra',
    type: 'historical',
    coordinates: [42.716, 35.588],
    descriptionAr: 'مدينة أثرية من العصر الفرثي، يونيسكو أدرجتها كموقع تراث عالمي عام 1985',
    descriptionEn: 'Ancient Parthian city, inscribed as a UNESCO World Heritage Site in 1985',
    unescoStatus: 'inscribed',
    governorateIso: 'IQ-NI',
  },

  // Erbil landmarks
  {
    nameAr: 'قلعة أربيل',
    nameEn: 'Erbil Citadel',
    type: 'historical',
    coordinates: [44.009, 36.191],
    descriptionAr: 'قلعة مأهولة بشكل متواصل منذ أكثر من 6000 سنة، مدرجة في قائمة التراث العالمي لليونسكو',
    descriptionEn: 'Continuously inhabited citadel for over 6,000 years, inscribed as UNESCO World Heritage Site in 2014',
    unescoStatus: 'inscribed',
    governorateIso: 'IQ-AR',
  },
  {
    nameAr: 'سوق قيصرية',
    nameEn: 'Qaysari Bazaar',
    type: 'market',
    coordinates: [44.005, 36.188],
    descriptionAr: 'سوق تاريخي عريق عند قاعدة قلعة أربيل، يضم المشغولات الكردية التقليدية',
    descriptionEn: 'Historic bazaar at the base of Erbil Citadel, with traditional Kurdish crafts and spices',
    governorateIso: 'IQ-AR',
  },

  // Sulaymaniyah landmarks
  {
    nameAr: 'متحف السليمانية',
    nameEn: 'Sulaymaniyah Museum',
    type: 'museum',
    coordinates: [45.437, 35.562],
    descriptionAr: 'من أكبر المتاحف في إقليم كردستان العراق، يضم آثار ما قبل التاريخ والحضارات القديمة',
    descriptionEn: 'One of the largest museums in Iraqi Kurdistan, containing prehistoric and ancient civilization artifacts',
    governorateIso: 'IQ-SU',
  },

  // Halabja
  {
    nameAr: 'نصب شهداء حلبجة',
    nameEn: 'Halabja Monument',
    type: 'monument',
    coordinates: [45.985, 35.178],
    descriptionAr: 'نصب تذكاري لضحايا الهجوم الكيمياوي على حلبجة عام 1988',
    descriptionEn: 'Memorial for victims of the 1988 chemical attack on Halabja',
    governorateIso: 'IQ-SU',
  },

  // Kirkuk
  {
    nameAr: 'قلعة كركوك',
    nameEn: 'Kirkuk Castle',
    type: 'historical',
    coordinates: [44.392, 35.474],
    descriptionAr: 'قلعة تاريخية تعلو تلة في وسط كركوك، تضم متحفاً ومسجداً وكنيسة',
    descriptionEn: 'Historic citadel on a hill in central Kirkuk, housing a museum, mosque and church',
    governorateIso: 'IQ-KI',
  },

  // Natural landmarks
  {
    nameAr: 'شلالات كلي علي بك',
    nameEn: 'Gali Ali Beg Waterfall',
    type: 'natural',
    coordinates: [44.535, 36.708],
    descriptionAr: 'أجمل الشلالات في كردستان العراق في وادي بيخال بمحافظة أربيل',
    descriptionEn: 'One of the most beautiful waterfalls in Iraqi Kurdistan, in Bekhaal Valley, Erbil Governorate',
    governorateIso: 'IQ-AR',
  },
  {
    nameAr: 'بحيرة دوكان',
    nameEn: 'Dukan Lake',
    type: 'natural',
    coordinates: [44.960, 35.960],
    descriptionAr: 'بحيرة اصطناعية كبيرة في السليمانية على نهر الزاب الصغير، وجهة سياحية شهيرة',
    descriptionEn: 'Large reservoir in Sulaymaniyah on the Little Zab River, a popular tourist destination',
    governorateIso: 'IQ-SU',
  },
  {
    nameAr: 'بحيرة دربندي خان',
    nameEn: 'Darbandikhan Lake',
    type: 'natural',
    coordinates: [45.689, 35.111],
    descriptionAr: 'بحيرة اصطناعية تقع على الحدود بين السليمانية وديالى',
    descriptionEn: 'Reservoir on the border of Sulaymaniyah and Diyala governorates',
    governorateIso: 'IQ-SU',
  },
  {
    nameAr: 'جبل حمرين',
    nameEn: 'Hamrin Mountains',
    type: 'natural',
    coordinates: [44.800, 34.200],
    descriptionAr: 'سلسلة جبلية تمتد عبر محافظات ديالى وصلاح الدين وكركوك',
    descriptionEn: 'Mountain range extending across Diyala, Salah al-Din and Kirkuk governorates',
    governorateIso: 'IQ-DI',
  },
  {
    nameAr: 'الأهوار (بلاد ما بين النهرين)',
    nameEn: 'Mesopotamian Marshes (Ahwar)',
    type: 'natural',
    coordinates: [47.000, 31.000],
    descriptionAr: 'منظومة أهوار واسعة في جنوب العراق، مدرجة في قائمة التراث العالمي لليونسكو عام 2016',
    descriptionEn: 'Extensive wetlands system in southern Iraq, inscribed as UNESCO World Heritage Site in 2016',
    unescoStatus: 'inscribed',
    governorateIso: 'IQ-DQ',
  },
] as const;

// ─── POI Categories ───────────────────────────────────────────────────────────

export const POI_CATEGORIES: readonly PoiCategory[] = [
  // Religious
  { nameAr: 'مسجد', nameEn: 'Mosque', nameKu: 'مزگەوت', osmKey: 'amenity', osmValue: 'place_of_worship', osmTags: { religion: 'muslim' }, icon: 'place-of-worship' },
  { nameAr: 'حسينية', nameEn: 'Hussainiyah', nameKu: 'حسەینیە', osmKey: 'amenity', osmValue: 'place_of_worship', osmTags: { 'place_of_worship:type': 'hussainiyah' }, icon: 'religious-muslim' },
  { nameAr: 'مرقد / ضريح', nameEn: 'Shrine / Mausoleum', nameKu: 'زیارەت', osmKey: 'historic', osmValue: 'tomb', icon: 'religious-muslim' },
  { nameAr: 'كنيسة', nameEn: 'Church', nameKu: 'کلێسا', osmKey: 'amenity', osmValue: 'place_of_worship', osmTags: { religion: 'christian' }, icon: 'religious-christian' },
  { nameAr: 'معبد إيزيدي', nameEn: 'Yazidi Temple', nameKu: 'پیرگەی ئێزدی', osmKey: 'amenity', osmValue: 'place_of_worship', osmTags: { religion: 'yazidi' }, icon: 'place-of-worship' },

  // Food & Drink
  { nameAr: 'مطعم', nameEn: 'Restaurant', nameKu: 'چێشتخانە', osmKey: 'amenity', osmValue: 'restaurant', icon: 'restaurant' },
  { nameAr: 'مقهى', nameEn: 'Café / Coffee Shop', nameKu: 'قاوەخانە', osmKey: 'amenity', osmValue: 'cafe', icon: 'cafe' },
  { nameAr: 'مشاوي / مطعم مشاوي', nameEn: 'Grills / BBQ Restaurant', nameKu: 'مەشوی', osmKey: 'amenity', osmValue: 'restaurant', osmTags: { cuisine: 'barbecue' }, icon: 'restaurant' },
  { nameAr: 'فلافل / فول', nameEn: 'Falafel & Ful', nameKu: 'فەلافیل', osmKey: 'amenity', osmValue: 'fast_food', osmTags: { cuisine: 'falafel' }, icon: 'fast-food' },
  { nameAr: 'سمكة / مطعم سمك', nameEn: 'Fish Restaurant', nameKu: 'فرۆشگای ماسی', osmKey: 'amenity', osmValue: 'restaurant', osmTags: { cuisine: 'seafood' }, icon: 'restaurant' },
  { nameAr: 'مخبز', nameEn: 'Bakery', nameKu: 'نانوایی', osmKey: 'shop', osmValue: 'bakery', icon: 'bakery' },
  { nameAr: 'حلويات', nameEn: 'Sweets / Confectionery', nameKu: 'شیرینی', osmKey: 'shop', osmValue: 'confectionery', icon: 'confectionery' },
  { nameAr: 'عصير طازج', nameEn: 'Fresh Juice Bar', nameKu: 'ئاژاوی تازە', osmKey: 'amenity', osmValue: 'juice_bar', icon: 'bar' },

  // Shopping
  { nameAr: 'سوق تقليدي', nameEn: 'Traditional Market / Souq', nameKu: 'بازاڕ', osmKey: 'amenity', osmValue: 'marketplace', icon: 'shop' },
  { nameAr: 'مول / مركز تجاري', nameEn: 'Shopping Mall', nameKu: 'مۆڵ', osmKey: 'shop', osmValue: 'mall', icon: 'shop' },
  { nameAr: 'سوبرماركت', nameEn: 'Supermarket', nameKu: 'سوپەرمارکت', osmKey: 'shop', osmValue: 'supermarket', icon: 'grocery' },
  { nameAr: 'محل ملابس', nameEn: 'Clothing Store', nameKu: 'فرۆشگای جل', osmKey: 'shop', osmValue: 'clothes', icon: 'clothing-store' },
  { nameAr: 'صيدلية', nameEn: 'Pharmacy', nameKu: 'دەرمانخانە', osmKey: 'amenity', osmValue: 'pharmacy', icon: 'pharmacy' },
  { nameAr: 'محل هواتف ومستلزمات', nameEn: 'Mobile Phone Shop', nameKu: 'فرۆشگای مۆبایل', osmKey: 'shop', osmValue: 'mobile_phone', icon: 'mobile-phone' },
  { nameAr: 'محل إلكترونيات', nameEn: 'Electronics Store', nameKu: 'فرۆشگای ئەلیکترۆنیک', osmKey: 'shop', osmValue: 'electronics', icon: 'electronics' },
  { nameAr: 'محل مجوهرات', nameEn: 'Jewellery', nameKu: 'جواهیرفرۆش', osmKey: 'shop', osmValue: 'jewelry', icon: 'jewelry-store' },
  { nameAr: 'محل سيارات', nameEn: 'Car Dealership', nameKu: 'فرۆشگای ئۆتۆمبێل', osmKey: 'shop', osmValue: 'car', icon: 'car' },
  { nameAr: 'كتب ومكتبة', nameEn: 'Bookshop', nameKu: 'کتێبفرۆش', osmKey: 'shop', osmValue: 'books', icon: 'library' },

  // Health
  { nameAr: 'مستشفى', nameEn: 'Hospital', nameKu: 'نەخۆشخانە', osmKey: 'amenity', osmValue: 'hospital', icon: 'hospital' },
  { nameAr: 'عيادة طبية', nameEn: 'Medical Clinic', nameKu: 'کلینیک', osmKey: 'amenity', osmValue: 'clinic', icon: 'hospital' },
  { nameAr: 'مركز صحي', nameEn: 'Health Centre', nameKu: 'ناوەندی تەندروستی', osmKey: 'amenity', osmValue: 'health_centre', icon: 'hospital' },
  { nameAr: 'مختبر طبي', nameEn: 'Medical Laboratory', nameKu: 'تاقیگەی پزیشکی', osmKey: 'amenity', osmValue: 'clinic', osmTags: { 'healthcare:speciality': 'laboratory' }, icon: 'hospital' },

  // Transport
  { nameAr: 'محطة وقود', nameEn: 'Petrol Station', nameKu: 'بنزینخانە', osmKey: 'amenity', osmValue: 'fuel', icon: 'fuel' },
  { nameAr: 'محطة حافلات', nameEn: 'Bus Station', nameKu: 'وێستگەی ئۆتۆبێس', osmKey: 'amenity', osmValue: 'bus_station', icon: 'bus' },
  { nameAr: 'موقف سرافيس / تكسي', nameEn: 'Shared Taxi Stand', nameKu: 'وێستگەی تاکسی', osmKey: 'amenity', osmValue: 'taxi', icon: 'car' },
  { nameAr: 'كراج / ورشة سيارات', nameEn: 'Car Repair Garage', nameKu: 'گەراج', osmKey: 'shop', osmValue: 'car_repair', icon: 'car' },
  { nameAr: 'مطار', nameEn: 'Airport', nameKu: 'فرۆکەخانە', osmKey: 'aeroway', osmValue: 'aerodrome', icon: 'airport' },
  { nameAr: 'ميناء', nameEn: 'Port', nameKu: 'بەندەر', osmKey: 'landuse', osmValue: 'harbour', icon: 'harbor' },

  // Education
  { nameAr: 'مدرسة', nameEn: 'School', nameKu: 'قوتابخانە', osmKey: 'amenity', osmValue: 'school', icon: 'school' },
  { nameAr: 'جامعة', nameEn: 'University', nameKu: 'زانکۆ', osmKey: 'amenity', osmValue: 'university', icon: 'college' },
  { nameAr: 'مكتبة عامة', nameEn: 'Public Library', nameKu: 'کتێبخانەی گشتی', osmKey: 'amenity', osmValue: 'library', icon: 'library' },

  // Government
  { nameAr: 'دائرة حكومية', nameEn: 'Government Office', nameKu: 'دەزگای حکووم', osmKey: 'office', osmValue: 'government', icon: 'town-hall' },
  { nameAr: 'مركز شرطة', nameEn: 'Police Station', nameKu: 'ناوەندی پۆلیس', osmKey: 'amenity', osmValue: 'police', icon: 'police' },
  { nameAr: 'محكمة', nameEn: 'Court', nameKu: 'دادگا', osmKey: 'amenity', osmValue: 'courthouse', icon: 'town-hall' },
  { nameAr: 'بريد', nameEn: 'Post Office', nameKu: 'پۆستخانە', osmKey: 'amenity', osmValue: 'post_office', icon: 'post' },
  { nameAr: 'بلدية', nameEn: 'Municipality', nameKu: 'شارەداری', osmKey: 'office', osmValue: 'government', osmTags: { 'government': 'municipality' }, icon: 'town-hall' },

  // Finance
  { nameAr: 'بنك', nameEn: 'Bank', nameKu: 'بانک', osmKey: 'amenity', osmValue: 'bank', icon: 'bank' },
  { nameAr: 'صراف / دار صرافة', nameEn: 'Currency Exchange', nameKu: 'سەرافی', osmKey: 'amenity', osmValue: 'bureau_de_change', icon: 'bank' },
  { nameAr: 'ATM / صراف آلي', nameEn: 'ATM', nameKu: 'ATM', osmKey: 'amenity', osmValue: 'atm', icon: 'bank' },

  // Accommodation
  { nameAr: 'فندق', nameEn: 'Hotel', nameKu: 'هۆتێل', osmKey: 'tourism', osmValue: 'hotel', icon: 'lodging' },
  { nameAr: 'شقق مفروشة', nameEn: 'Furnished Apartments', nameKu: 'شقەی دانراو', osmKey: 'tourism', osmValue: 'apartment', icon: 'lodging' },
  { nameAr: 'استراحة / منتجع', nameEn: 'Resort / Rest House', nameKu: 'ئاستراحەت', osmKey: 'tourism', osmValue: 'resort', icon: 'lodging' },

  // Tourism & Culture
  { nameAr: 'متحف', nameEn: 'Museum', nameKu: 'مۆزەخانە', osmKey: 'tourism', osmValue: 'museum', icon: 'museum' },
  { nameAr: 'موقع أثري', nameEn: 'Archaeological Site', nameKu: 'شوێنی ئەرکیۆلۆجی', osmKey: 'historic', osmValue: 'archaeological_site', icon: 'museum' },
  { nameAr: 'حديقة عامة', nameEn: 'Public Park', nameKu: 'پارکی گشتی', osmKey: 'leisure', osmValue: 'park', icon: 'park' },
  { nameAr: 'ملعب / استاد', nameEn: 'Stadium / Sports Ground', nameKu: 'ستادیۆم', osmKey: 'leisure', osmValue: 'stadium', icon: 'stadium' },
  { nameAr: 'مسبح', nameEn: 'Swimming Pool', nameKu: 'مەلەوانگە', osmKey: 'leisure', osmValue: 'swimming_pool', icon: 'swimming' },
  { nameAr: 'نادي رياضي / جيم', nameEn: 'Gym / Fitness Centre', nameKu: 'جیم', osmKey: 'leisure', osmValue: 'fitness_centre', icon: 'fitness-centre' },
  { nameAr: 'قاعة أفراح / زواجات', nameEn: 'Wedding Hall', nameKu: 'سالۆنی جژن', osmKey: 'amenity', osmValue: 'events_venue', osmTags: { 'events_venue:type': 'wedding' }, icon: 'music' },
  { nameAr: 'سينما', nameEn: 'Cinema', nameKu: 'سینەما', osmKey: 'amenity', osmValue: 'cinema', icon: 'cinema' },
  { nameAr: 'مسرح', nameEn: 'Theatre', nameKu: 'شانۆ', osmKey: 'amenity', osmValue: 'theatre', icon: 'theatre' },

  // Utilities & Services
  { nameAr: 'مغسلة / غسيل ملابس', nameEn: 'Laundry', nameKu: 'مەلبەسخانە', osmKey: 'shop', osmValue: 'laundry', icon: 'laundry' },
  { nameAr: 'صالون حلاقة رجالي', nameEn: 'Barber', nameKu: 'سەروسوور', osmKey: 'shop', osmValue: 'hairdresser', osmTags: { 'hairdresser': 'male' }, icon: 'hairdresser' },
  { nameAr: 'صالون تجميل نسائي', nameEn: 'Beauty Salon', nameKu: 'سالۆنی ژنانە', osmKey: 'shop', osmValue: 'beauty', icon: 'hairdresser' },
  { nameAr: 'تصوير / استوديو', nameEn: 'Photography Studio', nameKu: 'ستودیۆی وێنەکێشی', osmKey: 'shop', osmValue: 'photo', icon: 'camera' },
  { nameAr: 'خياطة / ترزي', nameEn: 'Tailor', nameKu: 'دەرزی', osmKey: 'shop', osmValue: 'tailor', icon: 'clothing-store' },

  // Tourism natural
  { nameAr: 'شلال', nameEn: 'Waterfall', nameKu: 'ئاودێر', osmKey: 'waterway', osmValue: 'waterfall', icon: 'waterfall' },
  { nameAr: 'بحيرة', nameEn: 'Lake', nameKu: 'گۆل', osmKey: 'natural', osmValue: 'water', icon: 'water' },
  { nameAr: 'جبل', nameEn: 'Mountain', nameKu: 'چیا', osmKey: 'natural', osmValue: 'peak', icon: 'mountain' },
] as const;

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Return a governorate by its ISO 3166-2 code, e.g. "IQ-BG".
 * Returns undefined if the code is not found.
 */
export function getGovernorateByIso(iso: string): Governorate | undefined {
  return GOVERNORATES.find((g) => g.iso === iso);
}

/**
 * Return all cities belonging to a given governorate.
 */
export function getCitiesByGovernorate(iso: string): readonly City[] {
  return MAJOR_CITIES.filter((c) => c.governorateIso === iso);
}

/**
 * Return the governorate capital city record, or undefined.
 */
export function getGovernorateCapital(iso: string): City | undefined {
  return MAJOR_CITIES.find((c) => c.governorateIso === iso && c.isGovernorateCapital);
}

/**
 * Return landmarks in a given governorate.
 */
export function getLandmarksByGovernorate(iso: string): readonly Landmark[] {
  return LANDMARKS.filter((l) => l.governorateIso === iso);
}

/**
 * Return landmarks of a specific type.
 */
export function getLandmarksByType(type: LandmarkType): readonly Landmark[] {
  return LANDMARKS.filter((l) => l.type === type);
}

/**
 * Return UNESCO-inscribed or tentative-listed landmarks.
 */
export function getUnescoLandmarks(status?: 'inscribed' | 'tentative'): readonly Landmark[] {
  return LANDMARKS.filter((l) => (status ? l.unescoStatus === status : l.unescoStatus !== undefined));
}
