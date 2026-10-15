---
id: M24
slug: provider-registration-test
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-provider:
    - "mobile-features/provider/src/**"
---

# M24 — اختبارات شاشة تسجيل المزوّد

**الحالة:** قيد التنفيذ · **التقدير:** 15 دقيقة · **يعتمد على:** [M23](M23-provider-inbox-detail-refresh.md)

## الهدف

إضافة اختبارات للتحقق من عمل معالج تسجيل المزوّد الرباعي الخطوات.

## الميزات المطلوبة

- [ ] **اختبارات تسجيل المزوّد** — اختبار عرض الخطوات والتنقل بينها.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | اختبار يتحقق من عرض حقلَي الاسم والهاتف في الخطوة 1 |
| AC-2 | اختبار يتحقق من انتقال الزر «التالي» إلى الخطوة 2 |
| AC-3 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-provider` يجتاز |

## ما تم إنجازه

- اختبار: يُظهر الخطوة 1 حقلَي الاسم والهاتف مع زر «التالي»
- اختبار: القيم الأولية للحقول فارغة
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-provider` ← 12/12 ناجحة
