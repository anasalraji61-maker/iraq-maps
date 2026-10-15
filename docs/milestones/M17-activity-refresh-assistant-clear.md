---
id: M17
slug: activity-refresh-assistant-clear
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-activity:
    - "mobile-features/activity/src/**"
  builder-assistant:
    - "mobile-features/assistant/src/**"
---

# M17 — سحب لتحديث تبويبات النشاط + مسح محادثة المساعد

**الحالة:** قيد التنفيذ · **التقدير:** 30 دقيقة · **يعتمد على:** [M16](M16-posts-tab-refresh.md)

## الهدف

إضافة سحب لتحديث (pull-to-refresh) في تبويبي "المسارات الأخيرة" و"الأماكن المحفوظة" من شاشة النشاط، وإضافة زر "مسح المحادثة" في شاشة المساعد الذكي.

## الميزات المطلوبة

- [ ] **سحب لتحديث في تبويب المسارات** — RefreshControl على قائمة المسارات الأخيرة.
- [ ] **سحب لتحديث في تبويب المحفوظات** — RefreshControl على قائمة الأماكن المحفوظة.
- [ ] **زر مسح المحادثة في المساعد** — زر في رأس شاشة المساعد يبدأ محادثة جديدة.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | السحب لأسفل في تبويب المسارات يُعيد تحميل القائمة |
| AC-2 | السحب لأسفل في تبويب المحفوظات يُعيد تحميل القائمة |
| AC-3 | ضغط زر مسح المحادثة يبدأ جلسة مساعد جديدة |
| AC-4 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-activity` يجتاز |
| AC-5 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-assistant` يجتاز |

## ما تم إنجازه

- إضافة RefreshControl إلى RoutesTab مع حالة `refreshing` ومعالج `load(true)`
- إضافة RefreshControl إلى SavedTab مع حالة `refreshing` ومعالج `load(true)`
- إضافة `clearPersistedSessionId()` في `useAssistantChat.ts`
- إضافة زر "محادثة جديدة" في رأس AssistantChatScreen يستدعي `clearPersistedSessionId` ويولد sessionId جديد
- مفاتيح i18n جديدة: `clearChat` و `clearChatA11y` في ar/ckb/en
- اختبار جديد: renders clear chat button and pressing it resets session
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-activity` ← 7/7 ناجحة
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-assistant` ← 5/5 ناجحة
