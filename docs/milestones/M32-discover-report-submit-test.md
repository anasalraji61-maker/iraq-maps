---
id: M32
slug: discover-report-submit-test
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-discover:
    - "mobile-features/discover/**"
---

# M32 — اختبار تأكيد إرسال بلاغ المنشور في اكتشف

## الهدف

إكمال اختبارات ميزة "بلاغ منشور" في شاشة اكتشف — التحقق من أن `api.reportPost` يُستدعى فعلياً عند اختيار سبب البلاغ. M30 أضافت اختبار ظهور الزر فقط.

## معايير القبول

- [ ] اختبار يتحقق من استدعاء `api.reportPost` عند اختيار سبب البلاغ من ActionSheetIOS / Alert.
- [ ] يجتاز `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-discover`.

## ما تم إنجازه

- اختبار يحاكي ActionSheetIOS على iOS ويتحقق من استدعاء `api.reportPost` عند اختيار سبب البلاغ
