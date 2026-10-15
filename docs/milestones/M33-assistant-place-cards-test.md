---
id: M33
slug: assistant-place-cards-test
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-messages:
    - "mobile-features/assistant/**"
---

# M33 — اختبار بطاقات الأماكن في المساعد

## الهدف

إضافة اختبار يتحقق من أن المساعد يعرض بطاقات أماكن متعددة عندما يُعيد الـ API حقل `focusPlaceIds`.

## معايير القبول

- [ ] اختبار يتحقق من ظهور بطاقات أماكن متعددة عند إرجاع `focusPlaceIds`.
- [ ] يجتاز `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-assistant`.

## ما تم إنجازه

- اختبار يتحقق من ظهور بطاقتي مكان بـ testID صحيح عند إرجاع `focusPlaceIds` بمكانين
