---
id: M23
slug: provider-inbox-detail-refresh
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-provider:
    - "mobile-features/provider/src/**"
---

# M23 — سحب لتحديث تفاصيل رسالة المزوّد

**الحالة:** قيد التنفيذ · **التقدير:** 15 دقيقة · **يعتمد على:** [M22](M22-inquiry-detail-refresh.md)

## الهدف

إضافة سحب لتحديث (pull-to-refresh) في شاشة تفاصيل الرسالة للمزوّد.

## الميزات المطلوبة

- [ ] **سحب لتحديث في تفاصيل الرسالة** — RefreshControl يُعيد تحميل نص الاستفسار.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | السحب لأسفل يُعيد تحميل بيانات الاستفسار |
| AC-2 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-provider` يجتاز |

## ما تم إنجازه

- إضافة `RefreshControl` إلى `ScrollView` في `ProviderInboxDetailScreen`
- تحديث `load` لقبول `isRefresh = false` وإدارة حالة `refreshing`
- اختبار جديد: re-fetches inquiry on pull-to-refresh
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-provider` ← 10/10 ناجحة
