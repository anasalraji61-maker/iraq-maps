---
id: M16
slug: posts-tab-refresh
status: in_progress
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-activity:
    - "mobile-features/activity/src/**"
---

# M16 — سحب لتحديث تبويب منشوراتي

**الحالة:** قيد التنفيذ · **التقدير:** 30 دقيقة · **يعتمد على:** [M15](M15-delete-comment.md)

## الهدف

إضافة سحب لتحديث (pull-to-refresh) في تبويب "منشوراتي" من شاشة النشاط.

## الميزات المطلوبة

- [ ] **سحب لتحديث في تبويب المشاركات** — RefreshControl على قائمة منشوراتي.

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | السحب لأسفل يُعيد تحميل قائمة المنشورات |
| AC-2 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-activity` يجتاز |

## ما تم إنجازه

- إضافة RefreshControl إلى FlatList في PostsTab
- إضافة حالة `refreshing` و `handleRefresh`
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-activity` ← نجح
