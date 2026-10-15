---
id: M20
slug: provider-dashboard-refresh
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-provider:
    - "mobile-features/provider/src/**"
---

# M20 — سحب لتحديث لوحة المزوّد

**الحالة:** قيد التنفيذ · **التقدير:** 20 دقيقة · **يعتمد على:** [M19](M19-place-card-tappable-links.md)

## الهدف

إضافة سحب لتحديث (pull-to-refresh) في لوحة تحكم المزوّد بدلاً من زر التحديث اليدوي.

## الميزات المطلوبة

- [ ] **سحب لتحديث في لوحة التحكم** — RefreshControl يُعيد تحميل الحالة والتحليلات.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | السحب لأسفل في لوحة التحكم يُعيد تحميل البيانات |
| AC-2 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-provider` يجتاز |

## ما تم إنجازه

- تحويل لوحة التحكم من `<Screen scroll>` إلى `SafeAreaView + ScrollView` مع `RefreshControl`
- إضافة حالة `refreshing` و `handleRefresh` يُعيد تحميل الحالة والتحليلات بالتوازي
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-provider` ← 9/9 ناجحة
