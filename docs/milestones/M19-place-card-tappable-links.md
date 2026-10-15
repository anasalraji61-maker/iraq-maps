---
id: M19
slug: place-card-tappable-links
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-map:
    - "mobile-features/map/src/**"
---

# M19 — بطاقة المكان: اتصال مباشر وفتح الموقع بنقرة

**الحالة:** قيد التنفيذ · **التقدير:** 20 دقيقة · **يعتمد على:** [M18](M18-inquiries-list-status.md)

## الهدف

تحويل حقلَي الهاتف والموقع في بطاقة المكان من نصوص ثابتة إلى روابط قابلة للنقر.

## الميزات المطلوبة

- [ ] **اتصال بنقرة** — رقم الهاتف قابل للنقر عبر `tel:` scheme.
- [ ] **فتح الموقع بنقرة** — الموقع الإلكتروني قابل للنقر عبر `Linking.openURL`.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | النقر على حقل الهاتف يفتح تطبيق الاتصال |
| AC-2 | النقر على حقل الموقع يفتح المتصفح |
| AC-3 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-map` يجتاز |

## ما تم إنجازه

- إضافة `Linking.openURL('tel:...')` على ListItem الهاتف في PlaceCard
- إضافة `Linking.openURL(url)` على ListItem الموقع في PlaceCard (مع تحقق من بادئة https)
- اختباران جديدان: opens tel: link on phone press، opens https website link on website press
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-map` ← 69/69 ناجحة
