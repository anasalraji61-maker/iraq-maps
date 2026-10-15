---
id: M27
slug: inquiries-list-refresh-test
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-messages:
    - "mobile-features/messages/src/**"
---

# M27 — اختبار سحب لتحديث قائمة الاستفسارات

**الحالة:** قيد التنفيذ · **التقدير:** 15 دقيقة · **يعتمد على:** [M26](M26-provider-dashboard-test.md)

## الهدف

إضافة اختبار للتحقق من أن سحب لتحديث في قائمة استفسارات المستخدم يُعيد تحميل البيانات.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | اختبار يتحقق من أن `onRefresh` يُعيد استدعاء `listInquiries` |
| AC-2 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-messages` يجتاز |

## ما تم إنجازه

- إضافة `testID="inquiries-list-scroll"` إلى `ScrollView` في `InquiriesListScreen`
- اختبار: `re-fetches inquiries on pull-to-refresh`
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-messages` ← ناجحة
