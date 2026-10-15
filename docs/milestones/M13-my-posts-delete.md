---
id: M13
slug: my-posts-delete
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-discover:
    - "mobile-features/activity/src/**"
    - "mobile-features/discover/src/**"
---

# M13 — My Posts: Delete from Activity Tab

**الحالة:** قيد التنفيذ · **التقدير:** 1 ساعة · **يعتمد على:** [M12](M12-discover-notifications.md)

## الهدف

إضافة حذف المنشور مباشرة من تبويب "مشاركاتي" في شاشة النشاط، مع تحسين عرض المنشورات (إظهار نوع المنشور وعدد التعليقات).

## الميزات المطلوبة

- [x] **حذف المنشور من تبويب المشاركات** — زر حذف على كل صف بمنشور مع تأكيد قبل الحذف، ويُزال المنشور من القائمة فور الحذف.
- [x] **تحسين عرض المنشور** — إظهار عدد التعليقات بجانب الإعجابات.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | ضغط حذف على منشور يُظهر رسالة تأكيد |
| AC-2 | بعد التأكيد يُحذف المنشور من القائمة مباشرة |
| AC-3 | لا نصوص ثابتة — كل النصوص عبر t() |
| AC-4 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-activity` يجتاز |

## ما تم إنجازه

- زر حذف على كل صف في تبويب "منشوراتي" مع تأكيد عبر Alert قبل الحذف
- حذف متشائل: يُزال المنشور من القائمة فور تأكيد الحذف
- مفاتيح i18n جديدة في ar/ckb/en: deletePost، deletePostConfirmTitle، deletePostConfirmMsg، deletePostError، deletePostCancel
- تحسين عرض الصف: عدد التعليقات يظهر بجانب الإعجابات
- اختبار جديد: posts tab shows my posts with a delete button
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-activity` ← 6/6 اختبارات ناجحة
