---
id: M21
slug: assistant-copy-message
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-assistant:
    - "mobile-features/assistant/src/**"
---

# M21 — نسخ رسالة المساعد بالضغط المطوّل

**الحالة:** قيد التنفيذ · **التقدير:** 20 دقيقة · **يعتمد على:** [M20](M20-provider-dashboard-refresh.md)

## الهدف

السماح للمستخدم بنسخ محتوى أي رسالة في المحادثة بالضغط المطوّل عليها.

## الميزات المطلوبة

- [ ] **نسخ بالضغط المطوّل** — الضغط المطوّل على رسالة ينسخ نصها إلى الحافظة.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | الضغط المطوّل على رسالة ينسخ محتواها |
| AC-2 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-assistant` يجتاز |

## ما تم إنجازه

- تحويل فقاعة الرسالة من `View` إلى `Pressable` مع `onLongPress` يستدعي `Clipboard.setString`
- `delayLongPress={500}` لتجنب التعارض مع النقر العادي
- اختبار جديد: copies message content on long press
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-assistant` ← 6/6 ناجحة
