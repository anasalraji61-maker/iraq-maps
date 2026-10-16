/**
 * Static administrative division data for Iraq.
 * Governorates → districts. Centers are approximate centroids from OSM.
 * Updated: 2024. Source: OSM admin_level=4 (governorates) and admin_level=6 (districts).
 * Licensed: ODbL (OSM-derived). See docs/DATA_SOURCES.md.
 */
import type { IraqAdminDivision } from '@iraq-maps/contracts';

export const IRAQ_ADMIN_DIVISIONS: IraqAdminDivision[] = [
  {
    id: 'baghdad',
    names: { ar: 'بغداد', ckb: 'بەغدا', en: 'Baghdad' },
    center: [44.3661, 33.3152],
    bbox: [44.088, 33.06, 44.65, 33.56],
    districts: [
      { id: 'baghdad-karkh', names: { ar: 'الكرخ', ckb: 'کەرخ', en: 'Karkh' }, center: [44.31, 33.33] },
      { id: 'baghdad-rusafa', names: { ar: 'الرصافة', ckb: 'ڕەسافە', en: 'Rusafa' }, center: [44.40, 33.33] },
      { id: 'baghdad-kadhimiya', names: { ar: 'الكاظمية', ckb: 'کاظمییە', en: 'Kadhimiya' }, center: [44.32, 33.38] },
      { id: 'baghdad-adhamiya', names: { ar: 'الأعظمية', ckb: 'ئەعزەمییە', en: 'Adhamiya' }, center: [44.37, 33.37] },
      { id: 'baghdad-karrada', names: { ar: 'الكرادة', ckb: 'کەرادە', en: 'Karrada' }, center: [44.38, 33.30] },
      { id: 'baghdad-mansour', names: { ar: 'المنصور', ckb: 'مەنسوور', en: 'Mansour' }, center: [44.33, 33.31] },
      { id: 'baghdad-dora', names: { ar: 'الدورة', ckb: 'دووڕە', en: 'Dora' }, center: [44.36, 33.24] },
      { id: 'baghdad-sadr', names: { ar: 'مدينة الصدر', ckb: 'باخچەی سەدر', en: 'Sadr City' }, center: [44.43, 33.36] },
    ],
  },
  {
    id: 'basra',
    names: { ar: 'البصرة', ckb: 'بەسرە', en: 'Basra' },
    center: [47.7804, 30.5085],
    bbox: [47.0, 29.5, 48.57, 31.5],
    districts: [
      { id: 'basra-city', names: { ar: 'قضاء البصرة', en: 'Basra City' }, center: [47.78, 30.51] },
      { id: 'basra-abu-al-khasib', names: { ar: 'أبو الخصيب', en: 'Abu Al-Khasib' }, center: [47.97, 30.44] },
      { id: 'basra-shatt-al-arab', names: { ar: 'شط العرب', en: 'Shatt Al-Arab' }, center: [48.04, 30.46] },
      { id: 'basra-qurna', names: { ar: 'القرنة', en: 'Qurna' }, center: [47.44, 31.01] },
      { id: 'basra-midaina', names: { ar: 'المدينة', en: 'Midaina' }, center: [47.30, 31.49] },
      { id: 'basra-hartha', names: { ar: 'الهارثة', en: 'Hartha' }, center: [47.69, 30.69] },
    ],
  },
  {
    id: 'ninewa',
    names: { ar: 'نينوى', ckb: 'نینەوا', en: 'Ninewa' },
    center: [43.1189, 36.3373],
    bbox: [41.0, 35.0, 44.5, 37.38],
    districts: [
      { id: 'ninewa-mosul', names: { ar: 'قضاء الموصل', ckb: 'مووسڵ', en: 'Mosul' }, center: [43.12, 36.34] },
      { id: 'ninewa-sinjar', names: { ar: 'سنجار', ckb: 'شنگار', en: 'Sinjar' }, center: [41.87, 36.32] },
      { id: 'ninewa-tal-afar', names: { ar: 'تلعفر', en: 'Tal Afar' }, center: [42.45, 36.37] },
      { id: 'ninewa-hamdaniya', names: { ar: 'الحمدانية', en: 'Hamdaniya' }, center: [43.46, 36.19] },
    ],
  },
  {
    id: 'sulaymaniyah',
    names: { ar: 'السليمانية', ckb: 'سلێمانی', en: 'Sulaymaniyah' },
    center: [45.4329, 35.5641],
    bbox: [44.5, 34.5, 46.5, 36.2],
    districts: [
      { id: 'sulaymaniyah-city', names: { ar: 'قضاء السليمانية', ckb: 'سلێمانی', en: 'Sulaymaniyah City' }, center: [45.43, 35.56] },
      { id: 'sulaymaniyah-halabja', names: { ar: 'حلبجة', ckb: 'هەڵەبجە', en: 'Halabja' }, center: [45.99, 35.18] },
      { id: 'sulaymaniyah-ranya', names: { ar: 'رانية', ckb: 'ڕانیە', en: 'Ranya' }, center: [44.87, 36.25] },
      { id: 'sulaymaniyah-kalar', names: { ar: 'كلار', ckb: 'کەلار', en: 'Kalar' }, center: [45.32, 34.62] },
      { id: 'sulaymaniyah-chamchamal', names: { ar: 'جمجمال', ckb: 'چەمچەماڵ', en: 'Chamchamal' }, center: [44.83, 35.53] },
    ],
  },
  {
    id: 'erbil',
    names: { ar: 'أربيل', ckb: 'هەولێر', en: 'Erbil' },
    center: [44.0088, 36.1901],
    bbox: [43.0, 35.3, 45.5, 37.1],
    districts: [
      { id: 'erbil-city', names: { ar: 'قضاء أربيل', ckb: 'هەولێر', en: 'Erbil City' }, center: [44.01, 36.19] },
      { id: 'erbil-shaqlawa', names: { ar: 'شقلاوة', ckb: 'شەقڵاوە', en: 'Shaqlawa' }, center: [44.32, 36.41] },
      { id: 'erbil-soran', names: { ar: 'سوران', ckb: 'سۆران', en: 'Soran' }, center: [44.54, 36.65] },
      { id: 'erbil-makhmur', names: { ar: 'مخمور', ckb: 'مەخموور', en: 'Makhmur' }, center: [43.58, 35.77] },
      { id: 'erbil-koisanjaq', names: { ar: 'كويسنجق', ckb: 'کۆیسنجاق', en: 'Koisanjaq' }, center: [44.63, 36.08] },
    ],
  },
  {
    id: 'kirkuk',
    names: { ar: 'كركوك', ckb: 'کەرکووک', en: 'Kirkuk' },
    center: [44.3922, 35.4681],
    bbox: [43.2, 34.5, 45.5, 36.2],
    districts: [
      { id: 'kirkuk-city', names: { ar: 'قضاء كركوك', ckb: 'کەرکووک', en: 'Kirkuk City' }, center: [44.39, 35.47] },
      { id: 'kirkuk-hawija', names: { ar: 'الحويجة', en: 'Hawija' }, center: [43.84, 35.36] },
      { id: 'kirkuk-dubbs', names: { ar: 'دبس', en: 'Dubbs' }, center: [44.11, 35.70] },
      { id: 'kirkuk-daquq', names: { ar: 'داقوق', en: 'Daquq' }, center: [44.25, 35.01] },
    ],
  },
  {
    id: 'duhok',
    names: { ar: 'دهوك', ckb: 'دهۆک', en: 'Duhok' },
    center: [42.9855, 36.8669],
    bbox: [42.2, 36.4, 43.9, 37.38],
    districts: [
      { id: 'duhok-city', names: { ar: 'قضاء دهوك', ckb: 'دهۆک', en: 'Duhok City' }, center: [42.99, 36.87] },
      { id: 'duhok-zakho', names: { ar: 'زاخو', ckb: 'زاخۆ', en: 'Zakho' }, center: [42.68, 37.14] },
      { id: 'duhok-amadiya', names: { ar: 'العمادية', ckb: 'ئامیدی', en: 'Amadiya' }, center: [43.49, 37.09] },
      { id: 'duhok-akre', names: { ar: 'عقرة', ckb: 'عەقرێ', en: 'Akre' }, center: [43.89, 36.74] },
    ],
  },
  {
    id: 'diyala',
    names: { ar: 'ديالى', en: 'Diyala' },
    center: [45.1458, 33.7690],
    bbox: [44.2, 33.0, 46.2, 35.0],
    districts: [
      { id: 'diyala-baquba', names: { ar: 'بعقوبة', en: 'Baquba' }, center: [44.65, 33.75] },
      { id: 'diyala-khanaqin', names: { ar: 'خانقين', ckb: 'خانەقین', en: 'Khanaqin' }, center: [45.38, 34.35] },
      { id: 'diyala-miqdadiya', names: { ar: 'المقدادية', en: 'Miqdadiya' }, center: [44.93, 33.97] },
      { id: 'diyala-kifri', names: { ar: 'كفري', ckb: 'کەفری', en: 'Kifri' }, center: [44.96, 34.69] },
    ],
  },
  {
    id: 'anbar',
    names: { ar: 'الأنبار', en: 'Anbar' },
    center: [41.5, 32.8],
    bbox: [38.79, 29.06, 44.0, 35.0],
    districts: [
      { id: 'anbar-ramadi', names: { ar: 'الرمادي', en: 'Ramadi' }, center: [43.30, 33.42] },
      { id: 'anbar-falluja', names: { ar: 'الفلوجة', en: 'Falluja' }, center: [43.78, 33.35] },
      { id: 'anbar-hit', names: { ar: 'هيت', en: 'Hit' }, center: [42.83, 33.64] },
      { id: 'anbar-qaim', names: { ar: 'القائم', en: 'Al-Qaim' }, center: [41.09, 34.38] },
      { id: 'anbar-haditha', names: { ar: 'حديثة', en: 'Haditha' }, center: [42.38, 34.12] },
    ],
  },
  {
    id: 'wasit',
    names: { ar: 'واسط', en: 'Wasit' },
    center: [45.7485, 32.6119],
    bbox: [44.5, 31.8, 47.0, 33.8],
    districts: [
      { id: 'wasit-kut', names: { ar: 'الكوت', en: 'Kut' }, center: [45.75, 32.49] },
      { id: 'wasit-numaniya', names: { ar: 'النعمانية', en: 'Numaniya' }, center: [45.33, 32.51] },
      { id: 'wasit-badra', names: { ar: 'بدرة', en: 'Badra' }, center: [46.13, 33.10] },
    ],
  },
  {
    id: 'babil',
    names: { ar: 'بابل', en: 'Babil' },
    center: [44.4205, 32.5085],
    bbox: [43.6, 31.8, 45.1, 33.0],
    districts: [
      { id: 'babil-hilla', names: { ar: 'الحلة', en: 'Hilla' }, center: [44.42, 32.47] },
      { id: 'babil-mahawil', names: { ar: 'المحاويل', en: 'Mahawil' }, center: [44.47, 32.65] },
      { id: 'babil-musayyib', names: { ar: 'المسيب', en: 'Musayyib' }, center: [44.28, 32.78] },
    ],
  },
  {
    id: 'karbala',
    names: { ar: 'كربلاء', en: 'Karbala' },
    center: [44.0272, 32.6136],
    bbox: [43.3, 32.0, 44.8, 33.2],
    districts: [
      { id: 'karbala-city', names: { ar: 'قضاء كربلاء', en: 'Karbala City' }, center: [44.03, 32.61] },
      { id: 'karbala-hindiya', names: { ar: 'الهندية', en: 'Hindiya' }, center: [44.23, 32.54] },
    ],
  },
  {
    id: 'najaf',
    names: { ar: 'النجف', en: 'Najaf' },
    center: [44.3257, 31.9946],
    bbox: [43.3, 29.8, 45.2, 32.7],
    districts: [
      { id: 'najaf-city', names: { ar: 'قضاء النجف', en: 'Najaf City' }, center: [44.33, 31.99] },
      { id: 'najaf-kufa', names: { ar: 'الكوفة', en: 'Kufa' }, center: [44.40, 32.03] },
      { id: 'najaf-manathira', names: { ar: 'المناذرة', en: 'Manathira' }, center: [44.62, 32.23] },
    ],
  },
  {
    id: 'qadisiyyah',
    names: { ar: 'القادسية', en: 'Qadisiyyah' },
    center: [44.9369, 31.9897],
    bbox: [44.0, 31.0, 46.0, 32.8],
    districts: [
      { id: 'qadisiyyah-diwaniya', names: { ar: 'الديوانية', en: 'Diwaniya' }, center: [44.93, 31.99] },
      { id: 'qadisiyyah-afak', names: { ar: 'عفك', en: 'Afak' }, center: [45.25, 32.07] },
      { id: 'qadisiyyah-shamiya', names: { ar: 'الشامية', en: 'Shamiya' }, center: [45.20, 31.97] },
    ],
  },
  {
    id: 'muthanna',
    names: { ar: 'المثنى', en: 'Muthanna' },
    center: [45.2896, 29.9085],
    bbox: [43.5, 28.5, 47.0, 31.0],
    districts: [
      { id: 'muthanna-samawa', names: { ar: 'السماوة', en: 'Samawa' }, center: [45.28, 31.32] },
      { id: 'muthanna-rumaitha', names: { ar: 'الرميثة', en: 'Rumaitha' }, center: [45.20, 31.53] },
    ],
  },
  {
    id: 'dhi-qar',
    names: { ar: 'ذي قار', en: 'Dhi Qar' },
    center: [46.2557, 31.0607],
    bbox: [44.5, 29.8, 47.8, 32.0],
    districts: [
      { id: 'dhi-qar-nasiriya', names: { ar: 'الناصرية', en: 'Nasiriya' }, center: [46.26, 31.06] },
      { id: 'dhi-qar-shatra', names: { ar: 'الشطرة', en: 'Shatra' }, center: [46.17, 31.41] },
      { id: 'dhi-qar-suq-ash-shuyukh', names: { ar: 'سوق الشيوخ', en: 'Suq ash-Shuyukh' }, center: [46.44, 30.97] },
    ],
  },
  {
    id: 'maysan',
    names: { ar: 'ميسان', en: 'Maysan' },
    center: [47.1500, 31.8400],
    bbox: [46.0, 31.0, 48.0, 32.9],
    districts: [
      { id: 'maysan-amara', names: { ar: 'العمارة', en: 'Amara' }, center: [47.15, 31.84] },
      { id: 'maysan-qalat-salih', names: { ar: 'قلعة صالح', en: 'Qalat Salih' }, center: [47.27, 31.52] },
    ],
  },
  {
    id: 'saladin',
    names: { ar: 'صلاح الدين', en: 'Saladin' },
    center: [43.6891, 34.4500],
    bbox: [42.5, 33.5, 45.0, 35.5],
    districts: [
      { id: 'saladin-tikrit', names: { ar: 'تكريت', en: 'Tikrit' }, center: [43.69, 34.62] },
      { id: 'saladin-samarra', names: { ar: 'سامراء', en: 'Samarra' }, center: [43.88, 34.20] },
      { id: 'saladin-baiji', names: { ar: 'بيجي', en: 'Baiji' }, center: [43.50, 34.93] },
      { id: 'saladin-tooz', names: { ar: 'طوزخورماتو', en: 'Tuz Khurmatu' }, center: [44.64, 34.88] },
    ],
  },
  {
    id: 'halabja',
    names: { ar: 'حلبجة', ckb: 'هەڵەبجە', en: 'Halabja' },
    center: [45.9856, 35.1775],
    bbox: [45.5, 34.9, 46.4, 35.5],
    districts: [
      { id: 'halabja-city', names: { ar: 'قضاء حلبجة', ckb: 'هەڵەبجە', en: 'Halabja City' }, center: [45.99, 35.18] },
      { id: 'halabja-khurmal', names: { ar: 'خورمال', ckb: 'خورماڵ', en: 'Khurmal' }, center: [46.06, 35.25] },
    ],
  },
];
