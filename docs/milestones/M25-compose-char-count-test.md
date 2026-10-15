---
id: M25
slug: compose-char-count-test
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-messages:
    - "mobile-features/messages/src/**"
---

# M25 — اختبار عداد الحروف في شاشة إنشاء الرسالة

**الحالة:** قيد التنفيذ · **التقدير:** 15 دقيقة · **يعتمد على:** [M24](M24-provider-registration-test.md)

## الهدف

إضافة اختبار للتحقق من أن عداد الحروف يتحدث عند الكتابة في حقل الرسالة.

## الميزات المطلوبة

- [ ] **اختبار عداد الحروف** — التحقق من عرض العدد الصحيح عند الإدخال.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | اختبار يتحقق من أن عداد الحروف يعرض `0/500` عند البداية |
| AC-2 | اختبار يتحقق من تحديث العداد بعد إدخال نص |
| AC-3 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-messages` يجتاز |

## ما تم إنجازه

- إضافة `testID="messaging.compose.input"` إلى TextField في ComposeScreen
- اختبار: يعرض `0/500` عند البداية
- اختبار: يُحدّث العداد بعد الإدخال
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-messages` ← ناجحة
