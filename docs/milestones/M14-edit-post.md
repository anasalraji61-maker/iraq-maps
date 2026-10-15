---
id: M14
slug: edit-post
status: in_progress
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-discover:
    - "mobile-features/activity/src/**"
    - "mobile-features/discover/src/**"
    - "modules/discover/src/**"
    - "packages/contracts/src/discover.ts"
---

# M14 — تعديل المنشور

**الحالة:** قيد التنفيذ · **التقدير:** 1 ساعة · **يعتمد على:** [M13](M13-my-posts-delete.md)

## الهدف

تمكين المستخدم من تعديل نص منشوره الخاص من تبويب "منشوراتي" في شاشة النشاط أو من قائمة "المزيد" في التغذية.

## الميزات المطلوبة

- [ ] **تعديل المنشور من تبويب المشاركات** — زر تعديل على كل صف بمنشور يفتح نافذة تعديل النص مع حفظ التغييرات.
- [ ] **تعديل المنشور من قائمة "المزيد" في التغذية** — نفس الوظيفة من التغذية الرئيسية.
- [ ] **نقطة نهاية PATCH /discover/posts/:postId في الخادم** — تحديث نص المنشور مع التحقق من الملكية.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | ضغط تعديل يفتح حقل نص مع المحتوى الحالي |
| AC-2 | بعد الحفظ يظهر النص الجديد في القائمة مباشرة |
| AC-3 | لا نصوص ثابتة — كل النصوص عبر t() |
| AC-4 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-activity` يجتاز |
| AC-5 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-discover` يجتاز |

## ما تم إنجازه

- إضافة `updatePost` إلى `discoverContract` في `packages/contracts/src/discover.ts`
- معالج PATCH في `modules/discover/src/discover.service.ts` و `modules/discover/src/discover.controller.ts`
- زر تعديل في تبويب "منشوراتي" مع نافذة تعديل inline
- زر تعديل في قائمة "المزيد" في التغذية الرئيسية
- مفاتيح i18n جديدة في ar/ckb/en
- اختبارات لكلا الميزتين
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-activity` ← نجح
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-discover` ← نجح
