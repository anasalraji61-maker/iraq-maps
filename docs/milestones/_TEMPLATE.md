---
id: Mx
slug: <slug>
status: not_started   # not_started | in_progress | done
branch: claude/iraq-smart-maps-app-aybpjn
owners:               # globs منفصلة؛ نفس الخريطة في tools/ownership/milestones/Mx.json
  builder-<name>:
    - "<path>/**"
  integrator:
    - "package.json"
    - "packages/contracts/**"
    - "packages/testing/**"
    - "apps/api/**"
    - "docs/milestones/**"
auditors:
  auditor-architecture-mx: architecture-contracts
  auditor-qa-mx: qa-build
---

# Mx — <العنوان>

**الحالة:** لم تبدأ · **التقدير:** <2–4> ساعة · **يعتمد على:** <[My](My-slug.md)> · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

<ما يستطيع المستخدم فعله في نهاية المرحلة، من البداية للنهاية.>

## الميزات المطلوبة

- [ ] **<الميزة>**
  - <التفاصيل>

## خارج النطاق

- <ما لا يدخل، ومتى يدخل إن كان مخططاً.>

## العقود

يجمّدها المكامل في commit `chore(Mx): freeze contracts` قبل أن يبدأ أي بنّاء (القواعد في [سياسة العقود](README.md#سياسة-العقود)). المحتوى المطلوب:

- HTTP routers: <...>
- ports / events / enums: <...>
- fakes و conformance suites في `packages/testing`: <...>
- typed stubs للحزم المشتركة: <...>

## توزيع الوكلاء

### البنّاؤون

يعملون بالتوازي كوكلاء في الخلفية، كلٌّ داخل مساراته فقط (انظر [البناء المتوازي](README.md#دورة-حياة-المرحلة)).

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-<name>` | `<path>/**` | <...> |

### المكامل (integrator)

**يملك:** <المسارات المشتركة>

<الربط في `apps/api` و `apps/mobile`، و ADRs المطلوبة.>

### المدققون

لم يكتب أيٌّ منهم كود هذه المرحلة، ولا يعدّلون الكود؛ يرفعون الملاحظات لمالك الملف.

| الوكيل | العدسة | يفحص |
|---|---|---|
| `auditor-<lens>-mx` | `<lens>` | <...> |

## معايير القبول

| # | المعيار | طريقة التحقق |
|---|---|---|
| 1 | <المعيار> | `<الأمر الدقيق>` |

## المتطلبات البيئية والبدائل المؤقتة

- <أداة أو خدمة، وكيف يُتحقق منها.>

**البدائل المؤقتة (mocks) في هذه المرحلة:** <...>. التفاصيل وما يلزم للتشغيل الحقيقي في [MOCKS.md](MOCKS.md).

## بوابة الإغلاق

كل البنود على **نفس الـ SHA** (التفاصيل في [بوابة الإغلاق](README.md#بوابة-الإغلاق)):

- [ ] `pnpm infra:local up && pnpm install --frozen-lockfile && pnpm gate` ينجح من نسخة نظيفة
- [ ] `pnpm android:precheck` ينجح
- [ ] `ci.yml` ناجح
- [ ] `android.yml`: job ‏build ناجح (APK ‏arm64 ≤ 40MB ومرفوع كـ artifact)، و job ‏e2e ناجح (تدفقات Maestro لهذه المرحلة وكل ما قبلها)
- [ ] `geo-data.yml` / `imagery.yml` ناجح (إن تغيّر `geo-services/**`)
- [ ] كل معايير القبول أعلاه مُثبتة بدليلها في «ما تم إنجازه»
- [ ] كل المدققين سجّلوا `APPROVED <sha>` بلا ملاحظات حاجبة مفتوحة
- [ ] commit و push إلى `claude/iraq-smart-maps-app-aybpjn`، وتسجيل الـ SHA في الجدول أدناه، وتحديث الفهرس

## المخاطر

- <الخطر، والتخفيف.>

## ما تم إنجازه

لم تبدأ بعد.

| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| | | | |
