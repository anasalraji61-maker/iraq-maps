/**
 * Iraq Tour3D seed data – famous historical and cultural landmarks.
 *
 * This file provides stub scene definitions for development and testing.
 * Each entry carries the minimum fields required by CreateSceneData.
 *
 * Data sources: public-domain geographic coordinates; names and descriptions
 * based on publicly available encyclopaedic knowledge.
 * All coordinates are [longitude, latitude] (GeoJSON order).
 *
 * LICENSE NOTE: coordinates are factual and not copyrightable.
 * Descriptive text is original and released under the project licence.
 */

import type { Tour3DCategory } from '@iraq-maps/contracts';
import type { CreateSceneData } from './tour3d.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeedScene extends CreateSceneData {
  descriptionEn?: string;
  annotations?: SeedAnnotation[];
}

export interface SeedAnnotation {
  labelAr: string;
  labelEn: string;
  iconType: 'info' | 'place' | 'photo' | 'food' | 'mosque' | 'historic' | 'shop';
  /** Offset in metres from scene location – [deltaLng, deltaLat] in degrees */
  locationOffset: [number, number];
}

export interface SeedTourRoute {
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  /** Indices into SEED_SCENES array (0-based) */
  sceneIndices: number[];
  city: string;
  category: Tour3DCategory;
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

export const SEED_SCENES: SeedScene[] = [
  // ── 1. Al-Mutanabbi Street, Baghdad ──────────────────────────────────────
  {
    nameAr: 'شارع المتنبي – بغداد',
    nameEn: 'Al-Mutanabbi Street – Baghdad',
    descriptionAr:
      'شارع المتنبي هو الشريان الثقافي والأدبي لمدينة بغداد. يمتد على ضفة نهر دجلة ويضم أقدم مكتبات العراق وأعرقها. سُمّي على اسم الشاعر العربي الكبير المتنبي، ويُعدّ ملتقى المثقفين والمفكرين والشعراء منذ قرون.',
    descriptionEn:
      "Al-Mutanabbi Street is the cultural and literary artery of Baghdad, stretching along the banks of the Tigris and housing Iraq's oldest bookshops. Named after the great Arab poet Al-Mutanabbi, it has been the meeting point of intellectuals, thinkers and poets for centuries.",
    lng: 44.3977,
    lat: 33.3416,
    altitude: 0,
    city: 'baghdad',
    category: 'neighborhood',
    thumbnailUrl: undefined,
  },

  // ── 2. Ctesiphon Arch (Taq Kisra), near Baghdad ──────────────────────────
  {
    nameAr: 'طاق كسرى – المدائن',
    nameEn: 'Ctesiphon Arch – Al-Madain',
    descriptionAr:
      'طاق كسرى أو إيوان كسرى هو أثر معماري فريد يعود إلى الحضارة الفارسية الساسانية في القرن الثالث الميلادي. يُعدّ أكبر قوس من الطوب في العالم ولا يزال قائماً حتى اليوم دليلاً على العظمة المعمارية القديمة.',
    descriptionEn:
      "The Ctesiphon Arch (Taq Kisra) is a remarkable Sassanid Persian monument from the 3rd century AD. It holds the record as the world's largest unsupported brick arch and stands today as testimony to ancient architectural mastery.",
    lng: 44.5821,
    lat: 33.0944,
    altitude: 0,
    city: 'baghdad',
    category: 'heritage',
    thumbnailUrl: undefined,
    annotations: [
      {
        labelAr: 'القوس الساساني الكبير',
        labelEn: 'The Great Sassanid Arch',
        iconType: 'historic',
        locationOffset: [0.0001, 0.0001],
      },
      {
        labelAr: 'موقع العاصمة الساسانية',
        labelEn: 'Site of the Sassanid Capital',
        iconType: 'info',
        locationOffset: [-0.0002, 0.0002],
      },
    ],
  },

  // ── 3. Ziggurat of Ur ─────────────────────────────────────────────────────
  {
    nameAr: 'زقورة أور – ذي قار',
    nameEn: 'Ziggurat of Ur – Dhi Qar',
    descriptionAr:
      'زقورة أور هي معبد سومري ضخم يعود إلى الألفية الثالثة قبل الميلاد، شُيّد في عهد الملك أورنمو. تقع في محافظة ذي قار وتُعدّ من أبرز المعالم الأثرية في العراق، وتمثّل جوهر الحضارة الرافدينية القديمة.',
    descriptionEn:
      "The Ziggurat of Ur is a massive Sumerian temple from the Third Millennium BC, built during the reign of King Ur-Nammu. Located in Dhi Qar governorate, it is one of Iraq's most prominent archaeological sites and embodies the essence of ancient Mesopotamian civilisation.",
    lng: 46.1036,
    lat: 30.9626,
    altitude: 0,
    city: 'ur',
    category: 'heritage',
    thumbnailUrl: undefined,
    annotations: [
      {
        labelAr: 'قدس الأقداس السومري',
        labelEn: 'Sumerian Holy of Holies',
        iconType: 'historic',
        locationOffset: [0.0002, 0.0001],
      },
      {
        labelAr: 'درج الزقورة الرئيسي',
        labelEn: 'Main Ziggurat Stairway',
        iconType: 'place',
        locationOffset: [-0.0001, -0.0002],
      },
      {
        labelAr: 'مقبرة الملكية الملكية',
        labelEn: 'Royal Cemetery of Ur',
        iconType: 'historic',
        locationOffset: [0.0003, -0.0001],
      },
    ],
  },

  // ── 4. Erbil Citadel ─────────────────────────────────────────────────────
  {
    nameAr: 'قلعة أربيل – أربيل',
    nameEn: 'Erbil Citadel – Erbil',
    descriptionAr:
      'قلعة أربيل أو هولير من أعرق المدن المسكونة في التاريخ البشري، إذ يمتد تاريخ سكنها لأكثر من ستة آلاف سنة. أُدرجت على قائمة التراث العالمي لليونسكو عام 2014، وتتربّع على تلّة عالية في وسط مدينة أربيل.',
    descriptionEn:
      "Erbil Citadel (Hawler) is one of the oldest continuously inhabited settlements in human history, with over 6,000 years of occupation. Inscribed on UNESCO's World Heritage List in 2014, it sits atop a high mound at the heart of Erbil city.",
    lng: 44.0090,
    lat: 36.1910,
    altitude: 30,
    city: 'erbil',
    category: 'heritage',
    thumbnailUrl: undefined,
    annotations: [
      {
        labelAr: 'البوابة الرئيسية للقلعة',
        labelEn: 'Main Citadel Gate',
        iconType: 'place',
        locationOffset: [0.0002, -0.0001],
      },
      {
        labelAr: 'متحف القلعة الداخلي',
        labelEn: 'Citadel Interior Museum',
        iconType: 'info',
        locationOffset: [-0.0001, 0.0002],
      },
    ],
  },

  // ── 5. Imam Ali Shrine, Najaf ─────────────────────────────────────────────
  {
    nameAr: 'مرقد الإمام علي – النجف',
    nameEn: 'Imam Ali Shrine – Najaf',
    descriptionAr:
      'يُعدّ مرقد الإمام علي بن أبي طالب في مدينة النجف الأشرف من أقدس البقاع عند المسلمين الشيعة وأكثرها زيارةً في العالم. يتميز بقبته الذهبية الباهرة ومآذنه الشامخة التي تُضيء سماء المدينة.',
    descriptionEn:
      'The Imam Ali Shrine in Najaf is one of the holiest sites for Shia Muslims and among the most visited pilgrimage destinations in the world. It is distinguished by its magnificent golden dome and towering minarets that illuminate the city skyline.',
    lng: 44.3160,
    lat: 31.9962,
    altitude: 0,
    city: 'najaf',
    category: 'shrine',
    thumbnailUrl: undefined,
    annotations: [
      {
        labelAr: 'القبة الذهبية',
        labelEn: 'Golden Dome',
        iconType: 'mosque',
        locationOffset: [0.0001, 0.0001],
      },
      {
        labelAr: 'الصحن العلوي الشريف',
        labelEn: 'Al-Alawi Courtyard',
        iconType: 'place',
        locationOffset: [-0.0002, 0.0001],
      },
    ],
  },

  // ── 6. Imam Hussein Shrine, Karbala ──────────────────────────────────────
  {
    nameAr: 'مرقد الإمام الحسين – كربلاء',
    nameEn: 'Imam Hussein Shrine – Karbala',
    descriptionAr:
      'يقع مرقد الإمام الحسين بن علي في قلب كربلاء المقدسة، وهو مقام ديني إسلامي شيعي بالغ الأهمية. يستقطب الملايين من الزوار سنوياً من مختلف أنحاء العالم، لا سيما في مناسبة ذكرى عاشوراء وزيارة الأربعين.',
    descriptionEn:
      'The Imam Hussein Shrine lies at the heart of holy Karbala and is a site of immense significance for Shia Muslims worldwide. It attracts millions of visitors annually, especially during the commemorations of Ashura and the Arbaeen pilgrimage.',
    lng: 44.0197,
    lat: 32.6161,
    altitude: 0,
    city: 'karbala',
    category: 'shrine',
    thumbnailUrl: undefined,
    annotations: [
      {
        labelAr: 'المرقد الحسيني الشريف',
        labelEn: 'Hussein Sacred Tomb',
        iconType: 'mosque',
        locationOffset: [0.0001, 0.0001],
      },
      {
        labelAr: 'مرقد أبي الفضل العباس',
        labelEn: 'Abbas Shrine',
        iconType: 'mosque',
        locationOffset: [0.0005, 0.0001],
      },
    ],
  },

  // ── 7. Mosul Museum (rebuilt) ─────────────────────────────────────────────
  {
    nameAr: 'متحف الموصل – الموصل',
    nameEn: 'Mosul Museum – Mosul',
    descriptionAr:
      'متحف الموصل هو ثاني أكبر المتاحف العراقية ويضمّ مقتنيات أثرية نادرة من حضارات آشور ونينوى وبابل. دمّره تنظيم داعش عام 2015، وهو اليوم في طور إعادة الإعمار والترميم بدعم دولي واسع.',
    descriptionEn:
      "Mosul Museum is Iraq's second-largest museum, housing rare artefacts from the Assyrian, Nineveh and Babylonian civilisations. Destroyed by ISIS in 2015, it is now being rebuilt and restored with broad international support.",
    lng: 43.1373,
    lat: 36.3451,
    altitude: 0,
    city: 'mosul',
    category: 'museum',
    thumbnailUrl: undefined,
    annotations: [
      {
        labelAr: 'قاعة التماثيل الآشورية',
        labelEn: 'Assyrian Statues Hall',
        iconType: 'historic',
        locationOffset: [0.0001, 0.0001],
      },
      {
        labelAr: 'مشروع إعادة الإعمار',
        labelEn: 'Reconstruction Project',
        iconType: 'info',
        locationOffset: [-0.0001, 0.0002],
      },
    ],
  },

  // ── 8. Babylon Ruins ──────────────────────────────────────────────────────
  {
    nameAr: 'مدينة بابل الأثرية – بابل',
    nameEn: 'Babylon Ruins – Babylon',
    descriptionAr:
      'كانت بابل عاصمة مملكة بابل القديمة وأحد أعظم مراكز الحضارة الإنسانية. موطن جنائن بابل المعلقة إحدى عجائب الدنيا السبع، وتضمّ بوابة عشتار الشهيرة وقصر نبوخذنصر الثاني. أُدرجت ضمن مواقع التراث العالمي لليونسكو عام 2019.',
    descriptionEn:
      'Babylon was the capital of the ancient Babylonian Empire and one of the greatest centres of human civilisation. Home to the Hanging Gardens of Babylon — one of the Seven Wonders — it also contains the famous Ishtar Gate and the palace of Nebuchadnezzar II. Inscribed as a UNESCO World Heritage Site in 2019.',
    lng: 44.4225,
    lat: 32.5420,
    altitude: 0,
    city: 'baghdad',
    category: 'heritage',
    thumbnailUrl: undefined,
    annotations: [
      {
        labelAr: 'بوابة عشتار',
        labelEn: 'Ishtar Gate',
        iconType: 'historic',
        locationOffset: [0.0002, 0.0001],
      },
      {
        labelAr: 'قصر نبوخذنصر الثاني',
        labelEn: 'Palace of Nebuchadnezzar II',
        iconType: 'historic',
        locationOffset: [-0.0003, 0.0002],
      },
      {
        labelAr: 'مسرح بابل الروماني',
        labelEn: 'Babylon Roman Theatre',
        iconType: 'place',
        locationOffset: [0.0001, -0.0003],
      },
      {
        labelAr: 'موقع الجنائن المعلقة (المفترض)',
        labelEn: 'Presumed Hanging Gardens Site',
        iconType: 'info',
        locationOffset: [-0.0001, -0.0002],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Curated tour routes
// ---------------------------------------------------------------------------

export const SEED_TOUR_ROUTES: SeedTourRoute[] = [
  {
    nameAr: 'جولة عجائب بغداد',
    nameEn: 'Wonders of Baghdad Tour',
    descriptionAr:
      'تجوّل عبر أبرز معالم العاصمة بغداد من شارع المتنبي الأدبي إلى طاق كسرى الشامخ وخرائب بابل الأسطورية.',
    descriptionEn:
      "Explore Baghdad's most iconic landmarks — from the literary Al-Mutanabbi Street to the towering Ctesiphon Arch and the legendary ruins of Babylon.",
    sceneIndices: [0, 1, 7],
    city: 'baghdad',
    category: 'heritage',
  },
  {
    nameAr: 'رحلة في قلب الحضارة السومرية',
    nameEn: 'Journey into Sumerian Civilisation',
    descriptionAr:
      'استكشف أعظم آثار الحضارة السومرية بدءاً بزقورة أور الضخمة وصولاً إلى قصور بابل الخالدة.',
    descriptionEn:
      'Discover the greatest monuments of Sumerian civilisation, from the massive Ziggurat of Ur to the eternal palaces of Babylon.',
    sceneIndices: [2, 7],
    city: 'ur',
    category: 'heritage',
  },
  {
    nameAr: 'مسيرة المقدسات – النجف وكربلاء',
    nameEn: 'Sacred Sites Pilgrimage – Najaf & Karbala',
    descriptionAr:
      'جولة روحانية تصطحبك من مرقد الإمام علي في النجف إلى مرقد الإمام الحسين في كربلاء.',
    descriptionEn:
      'A spiritual journey from the Imam Ali Shrine in Najaf to the Imam Hussein Shrine in Karbala.',
    sceneIndices: [4, 5],
    city: 'najaf',
    category: 'shrine',
  },
  {
    nameAr: 'كنوز أربيل العريقة',
    nameEn: 'Erbil Ancient Treasures',
    descriptionAr:
      'تجوّل في قلعة أربيل التي تُعدّ من أقدم المدن المسكونة على وجه الأرض، وتستكشف أسرار آلاف السنين.',
    descriptionEn:
      'Walk through Erbil Citadel, one of the oldest continuously inhabited settlements on Earth, and uncover secrets spanning thousands of years.',
    sceneIndices: [3],
    city: 'erbil',
    category: 'heritage',
  },
  {
    nameAr: 'تراث الموصل – من الرماد إلى النهضة',
    nameEn: 'Mosul Heritage – From Ashes to Revival',
    descriptionAr:
      'شاهد قصة نهوض متحف الموصل من رماد الدمار وإعادة بناء هويته الحضارية الأصيلة.',
    descriptionEn:
      'Witness the story of Mosul Museum rising from the ashes of destruction and rebuilding its authentic civilisational identity.',
    sceneIndices: [6],
    city: 'mosul',
    category: 'museum',
  },
];

// ---------------------------------------------------------------------------
// Helper: get scene at index (safe)
// ---------------------------------------------------------------------------

export function getSeedScene(index: number): SeedScene | null {
  return SEED_SCENES[index] ?? null;
}

export function getSeedTourRoute(index: number): SeedTourRoute | null {
  return SEED_TOUR_ROUTES[index] ?? null;
}
