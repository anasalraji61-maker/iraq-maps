---
id: M15
slug: delete-comment
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-discover:
    - "mobile-features/discover/src/**"
    - "modules/discover/src/**"
    - "packages/contracts/src/discover.ts"
---

# M15 — حذف التعليق

**الحالة:** قيد التنفيذ · **التقدير:** 1 ساعة · **يعتمد على:** [M14](M14-edit-post.md)

## الهدف

تمكين المستخدم من حذف تعليقه الخاص في شاشة التعليقات.

## الميزات المطلوبة

- [ ] **حذف التعليق** — زر حذف على تعليقات المستخدم فقط مع تأكيد قبل الحذف.
- [ ] **نقطة نهاية DELETE /discover/posts/:postId/comments/:commentId في الخادم** — حذف التعليق مع التحقق من الملكية.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | ضغط حذف يُظهر رسالة تأكيد |
| AC-2 | بعد التأكيد يُحذف التعليق من القائمة مباشرة |
| AC-3 | لا نصوص ثابتة — كل النصوص عبر t() |
| AC-4 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-discover` يجتاز |

## ما تم إنجازه

- إضافة `deleteComment` إلى `discoverContract` في `packages/contracts/src/discover.ts`
- معالج DELETE في `modules/discover/src/discover.controller.ts` و `modules/discover/src/discover.service.ts`
- زر حذف على تعليقات المستخدم في `CommentsScreen.tsx`
- مفاتيح i18n جديدة في ar/ckb/en
- اختبارات للميزة
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-discover` ← نجح
