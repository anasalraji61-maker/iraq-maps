---
id: M10
slug: admin-panel-real-api
status: completed
sha: de1a7cc
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-admin:
    - "apps/admin/src/**"
    - "apps/admin/package.json"
    - "packages/contracts/src/providers.ts"
    - "modules/providers/src/**"
    - "packages/contracts/src/admin/**"
  integrator:
    - "package.json"
    - "pnpm-workspace.yaml"
    - "pnpm-lock.yaml"
    - "turbo.json"
    - ".gitignore"
    - ".env.example"
    - "docs/milestones/**"
    - "docs/adr/**"
    - "CLAUDE.md"
    - "docs/ARCHITECTURE.md"
    - ".github/workflows/**"
---

# M10 — Admin Panel: Real API Wiring

**الحالة:** قيد التنفيذ · **التقدير:** 1–2 ساعة · **يعتمد على:** [M9](M9-post-launch-polish.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

## الهدف

ربط لوحة الإدارة (`apps/admin`) بالـ API الحقيقي بدل البيانات الوهمية:
1. مزوّدون: قائمة الانتظار، التحقق، الإيقاف، الرفض
2. سجل المراجعة (audit log)
3. إزالة mock fallbacks لهذه العمليات (نسخ احتياطية وهمية)

## الميزات المطلوبة

- [x] **Admin frontend – providers queue**
  - `getPendingProviders()`: استدعاء `GET /v1/admin/providers?status=pending` مع cursor-based pagination
  - `verifyProvider(id)`: استدعاء `POST /v1/admin/providers/:id/verify`
  - `suspendProvider(id)`: استدعاء `POST /v1/admin/providers/:id/suspend`
  - `rejectProvider(id, reason)`: استدعاء `POST /v1/admin/providers/:id/reject`

- [x] **Backend – reject endpoint**
  - إضافة `reject` إلى `adminProvidersContract` في `packages/contracts/src/providers.ts`
  - تنفيذ `adminReject(adminUserId, providerId, reason)` في `providers.service.ts`
  - وصل الـ route في `providers.controller.ts`

- [x] **Backend – audit log endpoint**
  - `GET /v1/admin/providers/audit-log` يعيد آخر 100 سجل عبر providers.service

- [x] **Admin frontend – audit log**
  - `getAuditLog()`: استدعاء الـ endpoint الجديد

- [x] **إزالة mock fallbacks**
  - حذف arrays الوهمية من `apps/admin/src/api.ts`
  - الحفاظ على mock لـ `getReportedPosts` (لا يوجد backend support بعد)
  - `useMock` flag محذوفة

## خارج النطاق

- تقارير المنشورات (reported posts) — لا يوجد backend support
- واجهة إضافة مشرفين
- فلترة سجل المراجعة

## معايير القبول

| # | المعيار | الدليل |
|---|---|---|
| AC-1 | `GET /v1/admin/providers?status=pending` يعيد بيانات حقيقية | test في `providers.service.test.ts` |
| AC-2 | `POST /v1/admin/providers/:id/reject` يعمل | test جديد |
| AC-3 | `GET /v1/admin/providers/audit-log` يعيد سجلات | test جديد |
| AC-4 | `apps/admin/src/api.ts` لا تحتوي mock arrays | code review |
| AC-5 | `pnpm gate` ناجح | مخرجات gate |
| AC-6 | لا أسرار | `pnpm gitleaks` نظيف |

## ما تم إنجازه

_يُملأ عند الإغلاق._
