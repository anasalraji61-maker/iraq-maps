---
id: M31
slug: inquiry-status-badge
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-messages:
    - "mobile-features/messages/**"
---

# M31 — شارة حالة شاملة في قائمة الاستفسارات

## الهدف

تحسين قائمة الاستفسارات (`InquiriesListScreen`) لتعرض حالة أكثر دقة:
- **مُرسَل** (sent/delivered/read) — تم الإرسال لكل الأماكن.
- **في الانتظار** (queued) — لم يُرسَل بعد.
- **تم الرد** (replied) — ردّ مكان واحد على الأقل.
- **فشل** (failed كلها) — فشل الإرسال.

حالياً تظهر فقط شارة "تم الرد" أو لا شيء.

## معايير القبول

- [ ] تظهر شارة الحالة المناسبة لكل استفسار بناءً على حالات targets.
- [ ] الألوان والنصوص عبر t() في ar / ckb / en.
- [ ] اختبار يتحقق من ظهور الشارة الصحيحة لكل حالة.
- [ ] يجتاز `pnpm turbo run lint typecheck test --filter=@iraq-maps/feature-messages`.

## ما تم إنجازه

- أضيفت دالة `getInquiryBadge()` تحسب الحالة الإجمالية من `targets`
- أربعة حالات: `badgePending` (برتقالي) / `badgeSent` (أزرق) / `badgeReplied` (أخضر) / `badgeFailed` (أحمر)
- مفاتيح i18n جديدة في ar/ckb/en
- أربعة اختبارات جديدة في `InquiriesListScreen.test.tsx` تغطي كل حالة
