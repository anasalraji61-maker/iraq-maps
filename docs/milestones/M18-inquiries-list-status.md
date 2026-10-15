---
id: M18
slug: inquiries-list-status
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-messages:
    - "mobile-features/messages/src/**"
---

# M18 — تحسين قائمة الاستفسارات: عدد الأماكن وحالة الردود

**الحالة:** قيد التنفيذ · **التقدير:** 30 دقيقة · **يعتمد على:** [M17](M17-activity-refresh-assistant-clear.md)

## الهدف

تحسين قائمة الاستفسارات بعرض عدد الأماكن المرسَل إليها وشارة الحالة (هل هناك رد؟).

## الميزات المطلوبة

- [ ] **عدد الأماكن المرسَل إليها** — كل صف في القائمة يُظهر عدد الأماكن في `targets`.
- [ ] **شارة الرد** — إن كان في `targets` هدف واحد على الأقل بحالة `replied`، تظهر شارة "رد".

## معايير القبول

| # | المعيار |
|---|---|
| AC-1 | كل صف استفسار يُظهر عدد الأماكن المستهدفة |
| AC-2 | الاستفسار الذي فيه رد واحد على الأقل يُظهر شارة |
| AC-3 | لا نصوص ثابتة — كل النصوص عبر t() |
| AC-4 | `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-messages` يجتاز |

## ما تم إنجازه

- تحديث InquiriesListScreen لعرض عدد الأماكن المستهدفة لكل استفسار
- إضافة شارة "رد" (badge) عندما يكون لدى الاستفسار هدف واحد على الأقل بحالة `replied`
- استخدام `RNText` مع styles للعناصر المنسقة بدلاً من UI Text (الذي لا يقبل style prop)
- مفاتيح i18n جديدة: `list.placesCount`، `list.placeCount`، `list.repliedBadge` في ar/ckb/en
- اختبار جديد: shows targets count and replied badge when a target replied
- `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-messages` ← 10/10 ناجحة
