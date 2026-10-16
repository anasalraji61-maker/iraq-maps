/**
 * Iraq routing constants: road network, speeds, border crossings, airports, ports.
 * Coordinates are WGS84 [lng, lat].
 * Speed values (km/h) are typical observed values; actual conditions vary greatly.
 */

import type { LngLat } from '@iraq-maps/contracts';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoadClass =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'unclassified'
  | 'residential'
  | 'service';

export interface NamedHighway {
  /** Route number / name used in Iraq */
  routeId: string;
  nameAr: string;
  nameEn: string;
  roadClass: RoadClass;
  /** [lng, lat] of start terminus */
  from: LngLat;
  /** [lng, lat] of end terminus */
  to: LngLat;
  fromNameAr: string;
  toNameAr: string;
  /** approximate length km */
  lengthKm: number;
  /** approximate travel time hours under normal conditions */
  normalTravelTimeH: number;
}

export interface BorderCrossing {
  nameAr: string;
  nameEn: string;
  coordinates: LngLat;
  country: string;
  /** ISO 3166-1 alpha-2 of the neighbouring country */
  neighbourIso2: string;
  type: 'road' | 'rail' | 'mixed';
  /** Is it currently open to civilian traffic? UNCERTAIN — verify before use */
  openUNCERTAIN: boolean;
  governorateIso: string;
}

export interface AirportInfo {
  nameAr: string;
  nameEn: string;
  iataCode: string;
  icaoCode: string;
  coordinates: LngLat;
  governorateIso: string;
  /** Runway length metres (approx) */
  runwayLengthM: number;
  international: boolean;
}

export interface PortInfo {
  nameAr: string;
  nameEn: string;
  coordinates: LngLat;
  governorateIso: string;
  type: 'sea' | 'river' | 'inland';
  /** Annual capacity TEU (approx) for sea ports; tonnes/year for river ports */
  capacityNote: string;
}

// ─── Typical road speeds in Iraq (km/h) ──────────────────────────────────────

/**
 * Typical free-flow speeds (km/h) by OSM highway class in Iraq.
 * Actual speeds depend heavily on traffic, road condition and time of day.
 */
export const IRAQ_ROAD_SPEEDS: Readonly<Record<RoadClass, number>> = {
  motorway: 100,
  trunk: 80,
  primary: 60,
  secondary: 50,
  tertiary: 40,
  unclassified: 30,
  residential: 20,
  service: 15,
} as const;

/**
 * Peak-hour speed reduction factor for Baghdad urban roads.
 * Multiply free-flow speed by this factor during rush hours (07:00–09:00 and 15:00–18:00).
 */
export const BAGHDAD_PEAK_HOUR_FACTOR = 0.45;

/**
 * Night-time speed factor (22:00–05:00) for intercity roads — reduced due to
 * checkpoint delays and reduced visibility.
 */
export const IRAQ_NIGHT_FACTOR = 0.75;

// ─── Named highway network ────────────────────────────────────────────────────

export const NAMED_HIGHWAYS: readonly NamedHighway[] = [
  {
    routeId: 'IQ-1',
    nameAr: 'الطريق السريع بغداد–الموصل (طريق 1)',
    nameEn: 'Baghdad–Mosul Expressway (Route 1)',
    roadClass: 'trunk',
    from: [44.361, 33.315],
    to: [43.137, 36.340],
    fromNameAr: 'بغداد',
    toNameAr: 'الموصل',
    lengthKm: 396,
    normalTravelTimeH: 5.5,
  },
  {
    routeId: 'IQ-2',
    nameAr: 'الطريق السريع بغداد–البصرة (طريق 2)',
    nameEn: 'Baghdad–Basra Expressway (Route 2)',
    roadClass: 'trunk',
    from: [44.361, 33.315],
    to: [47.783, 30.508],
    fromNameAr: 'بغداد',
    toNameAr: 'البصرة',
    lengthKm: 548,
    normalTravelTimeH: 7.0,
  },
  {
    routeId: 'IQ-10',
    nameAr: 'طريق بغداد–كربلاء–النجف',
    nameEn: 'Baghdad–Karbala–Najaf Road',
    roadClass: 'primary',
    from: [44.361, 33.315],
    to: [44.346, 31.995],
    fromNameAr: 'بغداد',
    toNameAr: 'النجف',
    lengthKm: 180,
    normalTravelTimeH: 2.5,
  },
  {
    routeId: 'IQ-4',
    nameAr: 'طريق بغداد–الأنبار–الرمادي',
    nameEn: 'Baghdad–Anbar–Ramadi Road',
    roadClass: 'trunk',
    from: [44.361, 33.315],
    to: [43.307, 33.426],
    fromNameAr: 'بغداد',
    toNameAr: 'الرمادي',
    lengthKm: 100,
    normalTravelTimeH: 1.5,
  },
  {
    routeId: 'IQ-5',
    nameAr: 'طريق بغداد–بعقوبة–ديالى',
    nameEn: 'Baghdad–Baqubah–Diyala Road',
    roadClass: 'primary',
    from: [44.361, 33.315],
    to: [44.650, 33.748],
    fromNameAr: 'بغداد',
    toNameAr: 'بعقوبة',
    lengthKm: 57,
    normalTravelTimeH: 1.0,
  },
  {
    routeId: 'IQ-7',
    nameAr: 'طريق تكريت–كركوك',
    nameEn: 'Tikrit–Kirkuk Road',
    roadClass: 'primary',
    from: [43.692, 34.609],
    to: [44.396, 35.468],
    fromNameAr: 'تكريت',
    toNameAr: 'كركوك',
    lengthKm: 136,
    normalTravelTimeH: 2.0,
  },
  {
    routeId: 'IQ-80',
    nameAr: 'طريق كركوك–أربيل',
    nameEn: 'Kirkuk–Erbil Road',
    roadClass: 'primary',
    from: [44.396, 35.468],
    to: [44.009, 36.191],
    fromNameAr: 'كركوك',
    toNameAr: 'أربيل',
    lengthKm: 88,
    normalTravelTimeH: 1.2,
  },
  {
    routeId: 'IQ-2B',
    nameAr: 'طريق البصرة–الناصرية',
    nameEn: 'Basra–Nasiriyah Road',
    roadClass: 'primary',
    from: [47.783, 30.508],
    to: [46.258, 31.000],
    fromNameAr: 'البصرة',
    toNameAr: 'الناصرية',
    lengthKm: 170,
    normalTravelTimeH: 2.5,
  },
  {
    routeId: 'IQ-KR1',
    nameAr: 'طريق أربيل–السليمانية',
    nameEn: 'Erbil–Sulaymaniyah Road',
    roadClass: 'primary',
    from: [44.009, 36.191],
    to: [45.441, 35.560],
    fromNameAr: 'أربيل',
    toNameAr: 'السليمانية',
    lengthKm: 190,
    normalTravelTimeH: 2.5,
  },
  {
    routeId: 'IQ-KR2',
    nameAr: 'طريق أربيل–دهوك–زاخو',
    nameEn: 'Erbil–Dohuk–Zakho Road',
    roadClass: 'primary',
    from: [44.009, 36.191],
    to: [42.682, 37.143],
    fromNameAr: 'أربيل',
    toNameAr: 'زاخو',
    lengthKm: 242,
    normalTravelTimeH: 3.0,
  },
  {
    routeId: 'IQ-NA1',
    nameAr: 'طريق الناصرية–الديوانية',
    nameEn: 'Nasiriyah–Diwaniyah Road',
    roadClass: 'primary',
    from: [46.258, 31.000],
    to: [44.924, 31.993],
    fromNameAr: 'الناصرية',
    toNameAr: 'الديوانية',
    lengthKm: 160,
    normalTravelTimeH: 2.2,
  },
] as const;

// ─── Border crossings ─────────────────────────────────────────────────────────

export const BORDER_CROSSINGS: readonly BorderCrossing[] = [
  {
    nameAr: 'منفذ إبراهيم الخليل (فيشخابور)',
    nameEn: 'Ibrahim Khalil (Fishkhabur)',
    coordinates: [42.347, 37.083],
    country: 'Turkey',
    neighbourIso2: 'TR',
    type: 'road',
    openUNCERTAIN: true,
    governorateIso: 'IQ-DA',
  },
  {
    nameAr: 'منفذ زاخو–سيلوبي',
    nameEn: 'Zakho–Silopi Border',
    coordinates: [42.685, 37.163],
    country: 'Turkey',
    neighbourIso2: 'TR',
    type: 'road',
    openUNCERTAIN: true,
    governorateIso: 'IQ-DA',
  },
  {
    nameAr: 'منفذ طريبيل',
    nameEn: 'Turaybil Border Crossing',
    coordinates: [38.804, 33.628],
    country: 'Jordan',
    neighbourIso2: 'JO',
    type: 'road',
    openUNCERTAIN: true,
    governorateIso: 'IQ-AN',
  },
  {
    nameAr: 'منفذ القائم–البوكمال',
    nameEn: 'Al-Qaim–Abu Kamal Border',
    coordinates: [40.915, 34.452],
    country: 'Syria',
    neighbourIso2: 'SY',
    type: 'road',
    openUNCERTAIN: false,
    governorateIso: 'IQ-AN',
  },
  {
    nameAr: 'منفذ ربيعة',
    nameEn: 'Rabia Border Crossing',
    coordinates: [41.974, 36.806],
    country: 'Syria',
    neighbourIso2: 'SY',
    type: 'road',
    openUNCERTAIN: false,
    governorateIso: 'IQ-NI',
  },
  {
    nameAr: 'منفذ المنذرية (خانقين)',
    nameEn: 'Munthiriyah (Khanaqin) Border',
    coordinates: [45.621, 34.351],
    country: 'Iran',
    neighbourIso2: 'IR',
    type: 'road',
    openUNCERTAIN: true,
    governorateIso: 'IQ-DI',
  },
  {
    nameAr: 'منفذ مندلي',
    nameEn: 'Mandali Border Crossing',
    coordinates: [45.555, 33.749],
    country: 'Iran',
    neighbourIso2: 'IR',
    type: 'road',
    openUNCERTAIN: true,
    governorateIso: 'IQ-DI',
  },
  {
    nameAr: 'منفذ زرباطية',
    nameEn: 'Zurbatiyah Border Crossing',
    coordinates: [46.098, 32.791],
    country: 'Iran',
    neighbourIso2: 'IR',
    type: 'road',
    openUNCERTAIN: true,
    governorateIso: 'IQ-WA',
  },
  {
    nameAr: 'منفذ الشلامجة',
    nameEn: 'Shalamcheh Border Crossing',
    coordinates: [47.907, 30.420],
    country: 'Iran',
    neighbourIso2: 'IR',
    type: 'road',
    openUNCERTAIN: true,
    governorateIso: 'IQ-BA',
  },
  {
    nameAr: 'منفذ عرعر',
    nameEn: 'Arar Border Crossing',
    coordinates: [41.028, 30.579],
    country: 'Saudi Arabia',
    neighbourIso2: 'SA',
    type: 'road',
    openUNCERTAIN: true,
    governorateIso: 'IQ-AN',
  },
  {
    nameAr: 'منفذ طيب / الطيب',
    nameEn: 'Tayyiba Border Crossing',
    coordinates: [46.532, 31.692],
    country: 'Iran',
    neighbourIso2: 'IR',
    type: 'road',
    openUNCERTAIN: true,
    governorateIso: 'IQ-MA',
  },
] as const;

// ─── Airports ─────────────────────────────────────────────────────────────────

export const AIRPORTS: readonly AirportInfo[] = [
  {
    nameAr: 'مطار بغداد الدولي',
    nameEn: 'Baghdad International Airport',
    iataCode: 'BGW',
    icaoCode: 'ORBI',
    coordinates: [44.234, 33.263],
    governorateIso: 'IQ-BG',
    runwayLengthM: 4000,
    international: true,
  },
  {
    nameAr: 'مطار أربيل الدولي',
    nameEn: 'Erbil International Airport',
    iataCode: 'EBL',
    icaoCode: 'ORER',
    coordinates: [43.963, 36.237],
    governorateIso: 'IQ-AR',
    runwayLengthM: 3900,
    international: true,
  },
  {
    nameAr: 'مطار البصرة الدولي',
    nameEn: 'Basra International Airport',
    iataCode: 'BSR',
    icaoCode: 'ORMM',
    coordinates: [47.662, 30.549],
    governorateIso: 'IQ-BA',
    runwayLengthM: 3600,
    international: true,
  },
  {
    nameAr: 'مطار النجف الدولي',
    nameEn: 'Al Najaf International Airport',
    iataCode: 'NJF',
    icaoCode: 'ORNI',
    coordinates: [44.404, 31.989],
    governorateIso: 'IQ-NA',
    runwayLengthM: 3600,
    international: true,
  },
  {
    nameAr: 'مطار السليمانية الدولي',
    nameEn: 'Sulaymaniyah International Airport',
    iataCode: 'ISU',
    icaoCode: 'ORSU',
    coordinates: [45.315, 35.561],
    governorateIso: 'IQ-SU',
    runwayLengthM: 3600,
    international: true,
  },
  {
    nameAr: 'مطار كركوك',
    nameEn: 'Kirkuk Airport',
    iataCode: 'KIK',
    icaoCode: 'ORKK',
    coordinates: [44.348, 35.469],
    governorateIso: 'IQ-KI',
    runwayLengthM: 3658,
    international: false,
  },
  {
    nameAr: 'مطار الموصل',
    nameEn: 'Mosul Airport',
    iataCode: 'OSM',
    icaoCode: 'ORBM',
    coordinates: [43.147, 36.305],
    governorateIso: 'IQ-NI',
    runwayLengthM: 3658,
    international: false,
  },
] as const;

// ─── Sea / river ports ────────────────────────────────────────────────────────

export const PORTS: readonly PortInfo[] = [
  {
    nameAr: 'ميناء أم قصر',
    nameEn: 'Umm Qasr Port',
    coordinates: [47.925, 30.031],
    governorateIso: 'IQ-BA',
    type: 'sea',
    capacityNote: 'Main commercial seaport; approx 3 million TEU capacity (expansion ongoing)',
  },
  {
    nameAr: 'ميناء خور الزبير',
    nameEn: 'Khor Al-Zubair Port',
    coordinates: [47.858, 30.142],
    governorateIso: 'IQ-BA',
    type: 'sea',
    capacityNote: 'Industrial / bulk cargo port handling oil and heavy materials',
  },
  {
    nameAr: 'ميناء البصرة (الكبير)',
    nameEn: 'Basra Port (Grand)',
    coordinates: [47.840, 30.475],
    governorateIso: 'IQ-BA',
    type: 'river',
    capacityNote: 'River port on Shatt al-Arab; primarily handles passenger and light cargo',
  },
  {
    nameAr: 'ميناء الفاو الكبير (قيد الإنشاء)',
    nameEn: 'Grand Faw Port (under construction)',
    coordinates: [48.037, 29.970],
    governorateIso: 'IQ-BA',
    type: 'sea',
    capacityNote: 'Planned mega-port; construction in progress as of 2024',
  },
] as const;
