---
id: M26
slug: provider-dashboard-test
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-provider:
    - "mobile-features/provider/src/**"
---

# M26 — اختبار سحب لتحديث قائمة صندوق بريد المزوّد

**الحالة:** قيد التنفيذ · **التقدير:** 15 دقيقة · **يعتمد على:** [M25](M25-compose-char-count-test.md)

## الهدف

إضافة اختبار للتحقق من أن سحب لتحديث في قائمة صندوق البريد يُعيد تحميل البيانات.

## الميزات المطلوبة

- [ ] **اختبار سحب لتحديث في قائمة الصندوق** — التحقق من إعادة جلب البيانات.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | اختبار يتحقق من أن `onRefresh` يُعيد استدعاء `listProviderInquiries` |
| AC-2 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-provider` يجتاز |

## ما تم إنجازه

- إضافة `testID="provider-inbox-list"` إلى `FlatList` في `ProviderInboxScreen`
- اختبار: `re-fetches inquiries on pull-to-refresh`
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-provider` ← 13/13 ناجحة
