---
id: M9
slug: post-launch-polish
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-site:
    - "site/**"
  builder-admin-metrics:
    - "modules/identity/src/**"
    - "packages/contracts/src/admin/**"
    - "apps/api/src/**"
    - "apps/admin/src/**"
  builder-media-worker:
    - "modules/media/src/**"
    - "modules/media/package.json"
    - "packages/contracts/src/media/**"
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

# M9 — تحسينات ما بعد الإطلاق

**الحالة:** قيد التنفيذ · **التقدير:** 2–3 ساعة · **يعتمد على:** [M8](M8-play-store-submission.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

## الهدف

تحسينات ثلاثة متوازية بعد إغلاق M8:
1. صفحة الويب الرئيسية لـ `iraqmaps.iq`
2. تنفيذ endpoint `/v1/admin/metrics` الحقيقي في الـ API
3. نقل معالجة الصور من inline إلى BullMQ worker

## الميزات المطلوبة

- [x] **صفحة الويب الرئيسية (`site/index.html`)**
  - تصميم عربي RTL، ألوان brand الخضراء (`#1a6b3a`)
  - أقسام: Hero (اسم + وصف + رابط تحميل APK)، مميزات (خريطة/بحث/مساعد/مراسلة)، سياسة الخصوصية، تواصل
  - رابط `site/delete-account/` موجود بالفعل

- [x] **Admin Metrics endpoint**
  - route `GET /v1/admin/metrics` يعيد `totalUsers`, `totalProviders`, `postsToday`, `pendingVerification`
  - محمي بـ `x-admin-key` header (نفس نمط `/internal/queues`)
  - استعلامات Drizzle عبر `identity`, `providers`, `discover` schemas

- [x] **Image Processing Worker**
  - نقل resize + compress من inline في `MediaService.uploadAsset` إلى BullMQ job `image-processing`
  - Queue: `image-processing` في Redis
  - MediaService يضع job ويعيد `assetId` فوراً (async variant)

## خارج النطاق

- iOS deployment
- A/B testing store listing
- Kurdish Sorani localization
- Domain + hosting setup

## معايير القبول

| # | المعيار | الدليل |
|---|---|---|
| AC-1 | `site/index.html` موجود وصالح HTML5 | ملف موجود |
| AC-2 | `GET /v1/admin/metrics` يعيد JSON صحيح مع admin key | test في `apps/api/src/app.test.ts` |
| AC-3 | Image processing worker queue مُعرَّف | `modules/media/src/image-worker.ts` موجود |
| AC-4 | `pnpm gate` ناجح | مخرجات gate |
| AC-5 | لا أسرار في الريبو | `pnpm gitleaks` نظيف |

## ما تم إنجازه

- **SHA الإغلاق:** `350c70d`
- **التاريخ:** 2026-10-15
- `site/index.html`: صفحة رئيسية عربية RTL لـ iraqmaps.iq — hero, 4 بطاقات مميزات, قسم خصوصية, footer. self-contained HTML/CSS, dark mode.
- `GET /v1/admin/metrics`: endpoint محمي بـ x-admin-key، 4 queries متوازية (totalUsers/totalProviders/postsToday/pendingVerification)، 3 test cases.
- `apps/admin/src/api.ts`: إضافة `VITE_ADMIN_KEY` env var وإرساله كـ x-admin-key في كل request. إزالة TODO.
- `modules/media/src/image-processing-worker.ts`: BullMQ queue + Worker لمعالجة الصور بـ sharp في background. `MediaService.resizeAsset` تضع job وترجع URL الأصل فوراً.
- `fix(media)`: `cleanupOrphaned()` تستعلم الآن عن الـ assets المرتبطة بـ discover.post وproviders.provider عبر cross-schema raw SQL، وتستثنيها من الحذف. آخر TODO comments محذوفة.
- `pnpm gitleaks`: نظيف
- `pnpm ownership:check --milestone M9`: ok (4 owners)
