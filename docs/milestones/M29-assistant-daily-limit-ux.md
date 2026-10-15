---
id: M29
slug: assistant-daily-limit-ux
status: in_progress
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-assistant:
    - "mobile-features/assistant/**"
---

# M29 — رسالة حد الاستخدام اليومي للمساعد

## الهدف

عندما يتجاوز المستخدم الحد اليومي للمساعد (HTTP 429)، يظهر له رسالة واضحة بالعربية توضح السبب وتخبره متى يمكنه العودة (اليوم التالي). حالياً يظهر فقط رسالة خطأ عامة.

## معايير القبول

- [ ] عند استلام 429 من الـ API، يظهر نص مختلف "وصلت للحد اليومي — حاول غداً" بدل رسالة الخطأ العامة.
- [ ] زر الإرسال يُعطَّل حتى اليوم التالي (أو يبقى فعّالاً لكن مع الرسالة الواضحة).
- [ ] النص في ar / ckb / en عبر t().
- [ ] يجتاز `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-assistant`.

## ما تم إنجازه

_يُملأ عند الإغلاق_
