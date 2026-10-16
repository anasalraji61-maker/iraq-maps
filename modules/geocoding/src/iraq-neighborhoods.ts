/**
 * Representative Baghdad and major-city neighbourhood list with Arabic names, centers and bboxes.
 * Source: OSM admin_level=8/9 features, ODbL.
 * The `id` prefix matches the parent governorate id so filtering is fast.
 */
import type { IraqNeighborhood } from '@iraq-maps/contracts';

export const IRAQ_NEIGHBORHOODS: IraqNeighborhood[] = [
  // ── Baghdad ──────────────────────────────────────────────────────────────
  {
    id: 'baghdad-karrada',
    names: { ar: 'الكرادة', ckb: 'کەرادە', en: 'Karrada' },
    center: [44.38, 33.30],
    bbox: [44.35, 33.27, 44.42, 33.33],
    informalName: 'كرادة مريم',
  },
  {
    id: 'baghdad-mansour',
    names: { ar: 'المنصور', ckb: 'مەنسوور', en: 'Mansour' },
    center: [44.34, 33.32],
    bbox: [44.29, 33.28, 44.38, 33.36],
  },
  {
    id: 'baghdad-jadriya',
    names: { ar: 'الجادرية', en: 'Jadriya' },
    center: [44.40, 33.27],
    bbox: [44.38, 33.25, 44.44, 33.30],
  },
  {
    id: 'baghdad-zayouna',
    names: { ar: 'الزيونة', en: 'Zayouna' },
    center: [44.45, 33.32],
    bbox: [44.43, 33.30, 44.48, 33.35],
  },
  {
    id: 'baghdad-dura',
    names: { ar: 'الدورة', en: 'Dora' },
    center: [44.37, 33.24],
    bbox: [44.33, 33.21, 44.42, 33.28],
  },
  {
    id: 'baghdad-amiriya',
    names: { ar: 'العامرية', en: 'Amiriya' },
    center: [44.25, 33.31],
    bbox: [44.22, 33.28, 44.29, 33.34],
  },
  {
    id: 'baghdad-hurriya',
    names: { ar: 'الحرية', en: 'Hurriya' },
    center: [44.33, 33.39],
    bbox: [44.30, 33.36, 44.36, 33.42],
  },
  {
    id: 'baghdad-sadr-city',
    names: { ar: 'مدينة الصدر', en: 'Sadr City' },
    center: [44.44, 33.36],
    bbox: [44.40, 33.32, 44.49, 33.40],
    informalName: 'الثورة',
  },
  {
    id: 'baghdad-kadhimiya',
    names: { ar: 'الكاظمية', ckb: 'کاظمییە', en: 'Kadhimiya' },
    center: [44.32, 33.39],
    bbox: [44.28, 33.36, 44.36, 33.42],
  },
  {
    id: 'baghdad-adhamiya',
    names: { ar: 'الأعظمية', en: 'Adhamiya' },
    center: [44.38, 33.37],
    bbox: [44.35, 33.34, 44.42, 33.40],
  },
  {
    id: 'baghdad-saidiya',
    names: { ar: 'السيدية', en: 'Saidiya' },
    center: [44.33, 33.26],
    bbox: [44.30, 33.23, 44.36, 33.29],
  },
  {
    id: 'baghdad-jihad',
    names: { ar: 'الجهاد', en: 'Jihad' },
    center: [44.29, 33.29],
    bbox: [44.26, 33.27, 44.32, 33.32],
  },
  {
    id: 'baghdad-bayaa',
    names: { ar: 'البياع', en: "Bay'aa" },
    center: [44.30, 33.31],
    bbox: [44.27, 33.29, 44.33, 33.33],
  },
  {
    id: 'baghdad-gazaliya',
    names: { ar: 'الغزالية', en: 'Ghazaliya' },
    center: [44.26, 33.36],
    bbox: [44.22, 33.33, 44.30, 33.39],
  },
  {
    id: 'baghdad-shaab',
    names: { ar: 'الشعب', en: 'Shaab' },
    center: [44.42, 33.39],
    bbox: [44.39, 33.37, 44.46, 33.41],
  },
  {
    id: 'baghdad-rashid',
    names: { ar: 'الرشيد', en: 'Rashid' },
    center: [44.37, 33.33],
    bbox: [44.35, 33.31, 44.40, 33.35],
  },
  {
    id: 'baghdad-tahrir',
    names: { ar: 'التحرير', en: 'Tahrir' },
    center: [44.37, 33.34],
    bbox: [44.35, 33.32, 44.39, 33.36],
  },
  {
    id: 'baghdad-bab-al-muadham',
    names: { ar: 'باب المعظم', en: 'Bab Al-Muadham' },
    center: [44.39, 33.35],
    bbox: [44.37, 33.33, 44.41, 33.37],
  },
  {
    id: 'baghdad-new-baghdad',
    names: { ar: 'بغداد الجديدة', en: 'New Baghdad' },
    center: [44.46, 33.31],
    bbox: [44.43, 33.28, 44.49, 33.34],
  },
  {
    id: 'baghdad-baladiyat',
    names: { ar: 'البلديات', en: 'Baladiyat' },
    center: [44.48, 33.34],
    bbox: [44.45, 33.32, 44.51, 33.36],
  },
  // ── Basra ─────────────────────────────────────────────────────────────────
  {
    id: 'basra-ashar',
    names: { ar: 'العشار', en: 'Ashar' },
    center: [47.82, 30.52],
    bbox: [47.79, 30.50, 47.85, 30.55],
  },
  {
    id: 'basra-khora',
    names: { ar: 'الخورة', en: 'Khora' },
    center: [47.79, 30.54],
    bbox: [47.76, 30.52, 47.82, 30.57],
  },
  {
    id: 'basra-margil',
    names: { ar: 'مرجيل', en: 'Margil' },
    center: [47.86, 30.52],
    bbox: [47.83, 30.50, 47.89, 30.54],
  },
  {
    id: 'basra-al-tannuma',
    names: { ar: 'التنومة', en: 'Al-Tannuma' },
    center: [47.75, 30.56],
    bbox: [47.72, 30.54, 47.78, 30.58],
  },
  // ── Erbil ─────────────────────────────────────────────────────────────────
  {
    id: 'erbil-citadel',
    names: { ar: 'قلعة أربيل', ckb: 'قەڵای هەولێر', en: 'Erbil Citadel' },
    center: [44.009, 36.191],
    bbox: [44.005, 36.188, 44.013, 36.195],
  },
  {
    id: 'erbil-ankawa',
    names: { ar: 'عنكاوا', ckb: 'ئەنکاوا', en: 'Ankawa' },
    center: [43.99, 36.22],
    bbox: [43.97, 36.20, 44.01, 36.24],
  },
  {
    id: 'erbil-ishtar',
    names: { ar: 'عشتار', ckb: 'ئەشتار', en: 'Ishtar' },
    center: [44.02, 36.18],
    bbox: [44.00, 36.17, 44.04, 36.20],
  },
  // ── Sulaymaniyah ──────────────────────────────────────────────────────────
  {
    id: 'sulaymaniyah-salim',
    names: { ar: 'سالم', ckb: 'ساڵم', en: 'Salim' },
    center: [45.44, 35.56],
    bbox: [45.42, 35.54, 45.46, 35.58],
  },
  {
    id: 'sulaymaniyah-bakrajo',
    names: { ar: 'بكرجو', ckb: 'بەکرەجۆ', en: 'Bakrajo' },
    center: [45.41, 35.54],
    bbox: [45.39, 35.52, 45.43, 35.56],
  },
  // ── Najaf ─────────────────────────────────────────────────────────────────
  {
    id: 'najaf-old-city',
    names: { ar: 'المدينة القديمة', en: 'Old City' },
    center: [44.31, 31.99],
    bbox: [44.29, 31.97, 44.33, 32.01],
  },
  {
    id: 'najaf-alawi',
    names: { ar: 'العلوي', en: 'Alawi' },
    center: [44.33, 32.01],
    bbox: [44.31, 31.99, 44.35, 32.03],
  },
  // ── Karbala ───────────────────────────────────────────────────────────────
  {
    id: 'karbala-old-city',
    names: { ar: 'المدينة القديمة', en: 'Old City Karbala' },
    center: [44.02, 32.61],
    bbox: [44.00, 32.59, 44.04, 32.63],
  },
  {
    id: 'karbala-husseiniya',
    names: { ar: 'الحسينية', en: 'Husseiniya' },
    center: [44.01, 32.60],
    bbox: [43.99, 32.58, 44.03, 32.62],
  },
  // ── Mosul ─────────────────────────────────────────────────────────────────
  {
    id: 'ninewa-old-mosul',
    names: { ar: 'الموصل القديمة', ckb: 'مووسڵی کۆن', en: 'Old Mosul' },
    center: [43.13, 36.35],
    bbox: [43.10, 36.33, 43.17, 36.37],
  },
  {
    id: 'ninewa-nineveh-east',
    names: { ar: 'الموصل الجديدة', ckb: 'مووسڵی نوێ', en: 'New Mosul' },
    center: [43.16, 36.33],
    bbox: [43.13, 36.30, 43.20, 36.36],
  },
];
