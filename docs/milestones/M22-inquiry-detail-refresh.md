---
id: M22
slug: inquiry-detail-refresh
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-messages:
    - "mobile-features/messages/src/**"
---

# M22 — سحب لتحديث تفاصيل الاستفسار

**الحالة:** قيد التنفيذ · **التقدير:** 15 دقيقة · **يعتمد على:** [M21](M21-assistant-copy-message.md)

## الهدف

إضافة سحب لتحديث (pull-to-refresh) في شاشة تفاصيل الاستفسار بدلاً من التحميل مرة واحدة فقط عند الفتح.

## الميزات المطلوبة

- [ ] **سحب لتحديث في تفاصيل الاستفسار** — RefreshControl يُعيد تحميل بيانات الاستفسار.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | السحب لأسفل في شاشة التفاصيل يُعيد تحميل بيانات الاستفسار |
| AC-2 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-messages` يجتاز |

## ما تم إنجازه

- استبدال `<Screen scroll>` بـ `SafeAreaView + ScrollView` مع `RefreshControl`
- استخراج منطق التحميل إلى `loadInquiry(isRefresh)` عبر `useCallback`
- إضافة حالة `refreshing` و `onRefresh` يُعيد استدعاء `loadInquiry(true)`
- اختبار جديد: re-fetches inquiry on pull-to-refresh
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-messages` ← 11/11 ناجحة
