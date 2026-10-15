---
id: M30
slug: discover-report-test
status: in_progress
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-discover:
    - "mobile-features/discover/**"
---

# M30 — اختبار بلاغ المنشور في اكتشف

## الهدف

إضافة اختبارات وحدة لميزة "بلاغ منشور" (report post) في شاشة اكتشف، للتحقق من أن زر البلاغ يطلب تأكيداً وأن الـ API يُستدعى عند التأكيد.

## معايير القبول

- [ ] اختبار يتحقق من أن الضغط على قائمة خيارات المنشور يعرض خيار البلاغ.
- [ ] اختبار يتحقق من أن اختيار سبب البلاغ يستدعي `api.reportPost`.
- [ ] يجتاز `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-discover`.

## ما تم إنجازه

_يُملأ عند الإغلاق_
