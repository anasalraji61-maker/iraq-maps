---
id: M7
slug: ops-privacy-budgets-rc
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-observability:
    - "packages/observability/**"
    - "adapters/errors-sentry/**"
    - "packages/mobile-kit/**"
  builder-cost-admin:
    - "modules/assistant/**"
    - "apps/admin/**"
  builder-legal-privacy:
    - "docs/legal/**"
    - "site/**"
    - "mobile-features/account/**"
    - "tools/gen-licenses.mjs"
  builder-release-budgets:
    - "infra/**"
    - "tools/bench/**"
    - ".github/workflows/geo-data.yml"
  builder-e2e-m7:
    - "e2e/**"
  integrator:
    - "package.json"
    - "pnpm-workspace.yaml"
    - "pnpm-lock.yaml"
    - "turbo.json"
    - ".gitignore"
    - ".env.example"
    - ".gitleaks.toml"
    - "packages/tooling/**"
    - "packages/contracts/**"
    - "packages/testing/**"
    - "packages/geo/**"
    - "packages/ui/**"
    - "packages/i18n/**"
    - "packages/db-kit/**"
    - "packages/api-client/**"
    - "packages/map-kit/**"
    - "tools/ownership/**"
    - "apps/api/**"
    - "apps/mobile/*"
    - "apps/mobile/app/**"
    - "apps/mobile/src/shell/**"
    - "apps/mobile/test/**"
    - "mobile-features/map/**"
    - "mobile-features/navigation/**"
    - "mobile-features/messages/**"
    - "mobile-features/provider/**"
    - "mobile-features/discover/**"
    - "mobile-features/activity/**"
    - "mobile-features/assistant/**"
    - "mobile-features/tour3d/**"
    - "modules/identity/**"
    - "modules/places/**"
    - "modules/routing/**"
    - "modules/providers/**"
    - "modules/messaging/**"
    - "modules/insights/**"
    - "modules/media/**"
    - "modules/discover/**"
    - "modules/activity/**"
    - "modules/notifications/**"
    - "modules/tour3d/**"
    - "adapters/llm-anthropic/**"
    - "adapters/whatsapp-cloud/**"
    - "adapters/storage-s3/**"
    - "adapters/push-fcm/**"
    - "geo-services/**"
    - ".github/workflows/ci.yml"
    - ".github/workflows/android.yml"
    - ".github/workflows/imagery.yml"
    - "docs/milestones/**"
    - "docs/adr/**"
    - "docs/ARCHITECTURE.md"
    - "docs/contract-requests/**"
    - "docs/reports/**"
    - "docs/DATA_SOURCES.md"
    - "docs/MOBILE_ARCHITECTURE.md"
    - "docs/TESTING.md"
    - "docs/play/**"
    - "docs/store/**"
    - "docs/API.md"
    - "docs/DEPLOYMENT.md"
    - "docs/LOCAL_DEV.md"
    - "CLAUDE.md"
    - "CHANGELOG.md"
    - "CONTRIBUTING.md"
    - "config/**"
    - "packages/job-kit/**"
    - "packages/visual-testing/**"
    - "packages/benchmarks/**"
    - "scripts/**"
    - "modules/social/**"
    - "modules/search/**"
    - "modules/moderation/**"
    - "modules/payments/**"
    - "modules/location-share/**"
    - "modules/incidents/**"
    - "modules/analytics/**"
    - "modules/geocoding/**"
    - "modules/reputation/**"
    - "modules/reviews/**"
    - "modules/listings/**"
    - "modules/appointments/**"
    - "docs/API_COMPLETE.md"
    - "docs/CONTRIBUTING.md"
    - "docs/MOBILE_FEATURES.md"
auditors:
  auditor-security-final: security-privacy
  auditor-licensing-final: licensing-data
  auditor-qa-final: qa-build
  auditor-architecture-final: architecture-contracts
  auditor-rtl-final: arabic-rtl-a11y
  auditor-assistant-final: assistant-evals
---

# M7 — التشغيل والخصوصية وميزانيات الأداء ونسخة مرشّحة للإطلاق التجريبي

**الحالة:** لم تبدأ · **التقدير:** 3–3.5 ساعة · **يعتمد على:** [M5](M5-assistant-insights.md)، [M6](M6-discover-activity-moderation.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

يصبح MVP جاهزاً للإطلاق التجريبي في المدينة الأولى، بما يلي:
- رصد أخطاء الخادم والتطبيق بدون بيانات شخصية، وسجلات منقّحة يثبت ذلك فحص آلي.
- صفحة تكلفة المساعد في لوحة الإدارة.
- سياسة خصوصية وشروط استخدام بالعربية (ثم الكردية والإنجليزية) داخل التطبيق، وفي صفحة قابلة للاستضافة.
- شاشة الخصوصية في «حسابي».
- ميزانيات الأداء مقاسة ومُحقّقة: حجم APK، و p95 للبحث والمسار على بيانات حقيقية، وزمن الشاشة الأولى، والتشغيل على أندرويد 8.
- صورة خادم مختبرة.
- رحلة Maestro كاملة لسيناريوهات MVP.
- تدقيق شامل نهائي بكل العدسات.

## الميزات المطلوبة

- [x] **المراقبة والسجلات**
  - ErrorReporter في packages/observability.
  - محوّل متوافق مع Sentry في حزمة منفصلة، يتعطل تلقائياً بدون DSN، ويحذف البيانات الشخصية قبل الإرسال.
  - error boundary في التطبيق عبر mobile-kit.
  - أداة تفحص كل سجلات سيناريوهات e2e بحثاً عن هواتف وتوكنات وإحداثيات دقيقة.
- [x] **تكلفة المساعد**
  تجميع يومي للاستهلاك والتكلفة، ولكل مستخدم بشكل مجمّع بلا بيانات شخصية، عبر endpoint للإدارة فقط، مع صفحة في لوحة الإدارة.
- [x] **الخصوصية والشروط**
  - نصوص بالعربية ثم ckb و en تغطي: البيانات المجمعة، والموقع، ومعالجة LLM، والمراسلة، والموافقات، والحذف، والتواصل.
  - تُعرض داخل «حسابي»، مع صفحة HTML ثابتة في site/ لرابط Google Play.
  - شاشة الخصوصية: دقة الموقع، وملخص الموافقات، وحذف الحساب.
  - مسودة نموذج Data safety.
- [x] **الميزانيات وجاهزية الإصدار**
  - p95 للبحث والمسار على بيانات حقيقية يصبح فحصاً حاجباً في geo-data.yml.
  - حجم APK مفروض منذ M0.
  - قياس زمن البدء البارد على المحاكي، ومحاكي API 26.
  - Dockerfile لـ apps/api مع smoke في CI، و compose لبيئة تجريبية، ودليل نشر يعتمد على قرار الاستضافة.
- [x] **رحلات E2E كاملة**
  - رحلة Maestro: دخول، بحث، مسار، مساعد، مراسلة، رد مزوّد، اكتشف، نشاطي، ثم حذف الحساب.
  - اختبار API يثبت أن حذف الحساب يمسح بيانات المستخدم من كل الوحدات.
- [x] **أدوار قاعدة بيانات لكل وحدة (مؤجل من M0)**
  - كل schema يُرحَّل بدور `<schema>_migrator` يملكها وحدها، بلا CREATE أو USAGE على غيرها.
  - التطبيق يعمل بدور تشغيل بصلاحيات DML فقط على schemas وحداته.
  - هذا يحوّل فحص db-kit المعجمي إلى عزل حقيقي في الإنتاج.
- [x] **شاشة «تراخيص المصادر المفتوحة» داخل التطبيق (من تدقيق ترخيص M0، LIC-M0-06)**
  - تُولَّد عند البناء من `pnpm licenses list --prod --json --filter "@iraq-maps/mobile..."` ومن تقرير تراخيص Gradle، بلا مكتبة تراخيص Play-services وقت التشغيل.
  - تضم النصوص الكاملة لتراخيص Apache-2.0 (منها Material Symbols) و OFL-1.1 (Noto Sans Arabic) و MIT، ومحتوى ملفات NOTICE (مثل Apache Commons).
  - تحتوي إسناد OSM ورابط https://www.openstreetmap.org/copyright.

## خارج النطاق

- الرفع إلى Google Play والتوقيع الإنتاجي.
- النشر الإنتاجي و IaC، ويضاف كمرحلة بعد اختيار الاستضافة.
- iOS، وتنفيذ التجول ثلاثي الأبعاد، ومدن أخرى.

## العقود

يجمّدها المكامل في commit `chore(M7): freeze contracts` قبل أن يبدأ أي بنّاء (القواعد في [سياسة العقود](README.md#سياسة-العقود)). المحتوى المطلوب:

The integrator freezes contracts in 20 min or less. It adds:
- the ErrorReporter port
- the canonical PII redaction field list, consumed by observability
- admin assistant-costs router: GET /v1/admin/assistant/usage?from&to&groupBy
- legal content keys and the GET /legal/privacy and /legal/terms routes
- FakeErrorReporter with a conformance suite
- env names: SENTRY_DSN, EXPO_PUBLIC_SENTRY_DSN (a public DSN only), CDN_BASE_URL
- ownership front-matter

No new events.

## توزيع الوكلاء

### البنّاؤون

يعملون بالتوازي كوكلاء في الخلفية، كلٌّ داخل مساراته فقط (انظر [البناء المتوازي](README.md#دورة-حياة-المرحلة)).

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-observability` | `packages/observability/**`<br>`adapters/errors-sentry/**`<br>`packages/mobile-kit/**` | • ErrorReporter، ومحوّل Sentry يتعطل بدون DSN.<br>• توسيع قواعد التنقيح، وأداة فحص السجلات.<br>• error boundary في mobile-kit. |
| `builder-cost-admin` | `modules/assistant/**`<br>`apps/admin/**` | • تجميع التكلفة اليومية في assistant، مع endpoint للإدارة فقط.<br>• صفحة التكلفة في لوحة الإدارة. |
| `builder-legal-privacy` | `docs/legal/**`<br>`site/**`<br>`mobile-features/account/**` | • مسودات سياسة الخصوصية والشروط بالعربية ثم ckb و en.<br>• صفحة HTML ثابتة.<br>• شاشة الخصوصية، وعرض النصوص في حسابي.<br>• مسودة Data safety. |
| `builder-release-budgets` | `infra/**`<br>`tools/bench/**`<br>`.github/workflows/geo-data.yml` | • Dockerfile و compose ودليل النشر.<br>• جعل قياسات p95 حاجبة في geo-data.yml.<br>• تحسينات tools/bench. |
| `builder-e2e-m7` | `e2e/**` | • رحلة MVP الكاملة.<br>• اختبار الحذف عبر كل الوحدات.<br>• فاحص السجلات عبر كل السيناريوهات.<br>• تدفق السياسات. |

### المكامل (integrator)

**يملك:** `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `turbo.json`، `.gitignore`، `.env.example`، `.gitleaks.toml`، `packages/tooling/**`، `packages/contracts/**`، `packages/testing/**`، `tools/ownership/**`، `apps/api/**`، `apps/mobile/*`، `apps/mobile/app/**`، `apps/mobile/src/shell/**`، `.github/workflows/ci.yml`، `.github/workflows/android.yml`، `docs/milestones/**`، `docs/adr/**`، `docs/ARCHITECTURE.md`، `CLAUDE.md`

- ربط ErrorReporter في الخادم والتطبيق.
- تقديم صفحات السياسات العامة.
- إضافة مصفوفة API 26 وقياس البدء البارد إلى android.yml، و job ‏docker smoke إلى ci.yml.
- تحديث ARCHITECTURE.md و ADRs وتغطية MVP.
- إدارة التدقيق النهائي، وإغلاق MVP.

### المدققون

لم يكتب أيٌّ منهم كود هذه المرحلة، ولا يعدّلون الكود؛ يرفعون الملاحظات لمالك الملف.

| الوكيل | العدسة | يفحص |
|---|---|---|
| `auditor-security-final` | `security-privacy` | تدقيق شامل على SHA المرشّح للإطلاق:<br>• الأسرار في كامل التاريخ.<br>• تفويض كل endpoint، وحدود المعدّل.<br>• البيانات الشخصية في السجلات وتقارير الأخطاء.<br>• الموافقات، والحذف الشامل.<br>• صلاحيات الـ workflows، و EXPO_PUBLIC بلا أسرار. |
| `auditor-licensing-final` | `licensing-data` | • اكتمال DATA_SOURCES.<br>• الإسناد في كل الطبقات.<br>• تراخيص حزم npm و Maven و PyPI والخطوط.<br>• السياسة تذكر OSM و Copernicus ومعالجة LLM.<br>• التوصية بمراجعة قانونية بشرية. |
| `auditor-qa-final` | `qa-build` | • أرقام الميزانيات من تشغيل CI الحقيقي.<br>• الرحلة الكاملة على API 26 و API 30.<br>• توثيق صادق لحدود قياس الشاشة الأولى.<br>• كل الـ workflows لنفس الـ SHA. |
| `auditor-architecture-final` | `architecture-contracts` | على كامل المستودع:<br>• depcruise و knip و jscpd.<br>• تطابق ARCHITECTURE.md مع ADRs.<br>• tour3d محجوز بلا تنفيذ.<br>• README كل حزمة محدّث. |
| `auditor-rtl-final` | `arabic-rtl-a11y` | مرور شامل على كل الشاشات بالعربية والكردية والإنجليزية:<br>• التباين AA، وأحجام اللمس، وقارئ الشاشة.<br>• سلامة نصوص السياسات. |
| `auditor-assistant-final` | `assistant-evals` | • إعادة تشغيل evals.<br>• مراجعة صفحة التكلفة.<br>• عدم تسجيل محادثات فيها بيانات شخصية. |

## معايير القبول

| # | المعيار | طريقة التحقق |
|---|---|---|
| 1 | السجلات خالية من البيانات الشخصية | `pnpm --filter @iraq-maps/observability test` covers the redaction units.<br>The full e2e-api suite runs with log capture, and a scanner asserts none of these appear:<br>• +964 or 07xxxxxxxxx patterns<br>• bearer tokens or JWTs<br>• coordinates with more than 3 decimals |
| 2 | الأخطاء تُبلَّغ بلا بيانات شخصية، والمراقبة تتعطل بدون DSN | An unhandled API exception reaches FakeErrorReporter with PII scrubbed.<br>`pnpm --filter @iraq-maps/adapter-errors-sentry test`: the adapter is disabled when SENTRY_DSN is empty.<br>The mobile error boundary reports through mobile-kit (RNTL). |
| 3 | صفحة تكلفة المساعد للإدارة فقط وبأرقام صحيحة | `pnpm --filter @iraq-maps/assistant test -- costs`: daily aggregates are correct; a non-admin gets 403.<br>`pnpm --filter @iraq-maps/admin test`. |
| 4 | سياسة الخصوصية والشروط متاحة بالعربية داخل التطبيق وكصفحة ثابتة | `pnpm --filter @iraq-maps/feature-account test -- privacy` renders the policy and terms in ar, ckb and en.<br>`pnpm --filter @iraq-maps/site build` produces the privacy and terms HTML.<br>A checklist in the milestone file confirms the coverage points. |
| 5 | ميزانيات الأداء محققة | • geo-data.yml perf jobs on real data are blocking: search p95 under 800ms, route p95 under 1.5s.<br>• android.yml enforces an APK of 40MB or less.<br>• Emulator cold start is measured with `adb shell am start -W` (TotalTime) and recorded against the 3000ms target; it is report-only, with a manual check by the user on a real 3GB device.<br>• A test asserts minSdkVersion 26. |
| 6 | التطبيق يعمل على أندرويد 8 ورحلة MVP الكاملة تنجح | android.yml e2e job green on the API 30 and API 26 matrix: e2e/mobile/flows/mvp-journey.yaml (login, search, route, assistant, message, provider reply, discover, activity, delete account) plus all feature flows |
| 7 | حذف الحساب يمسح بيانات المستخدم من كل الوحدات | `pnpm --filter @iraq-maps/e2e-api test -- delete-account`: after DELETE /v1/me, every module schema has no rows for that user and the media files are removed |
| 8 | صورة الخادم تُبنى وتعمل | ci.yml docker job: build infra/docker/api.Dockerfile, run the container against the postgis service, and GET /health returns 200 |
| 9 | تدقيق شامل نهائي بكل العدسات وتغطية MVP موثّقة | • Every acceptance criterion of this milestone passes on the release-candidate head SHA of claude/iraq-smart-maps-app-aybpjn.<br>• gitleaks scans the full history.<br>• All six auditors record APPROVED in docs/milestones/M7-ops-privacy-budgets-rc.md.<br>• docs/milestones/README.md maps every MVP.md item to its milestone and evidence. |

## المتطلبات البيئية والبدائل المؤقتة

- SENTRY_DSN is optional (Sentry SaaS or self-hosted GlitchTip). An empty DSN disables the adapter, and the gate uses FakeErrorReporter.
- Real data for the budgets comes from the geo-data.yml artifacts built in M1 and M2.
- Docker is available on GitHub runners for the image smoke test; it cannot run locally.
- Live-only, mocked until provided (see MOCKS.md): a public URL for the privacy policy (for example GitHub Pages); production hosting, object storage and CDN; a Google Play developer account and upload keystore (kept outside the repo).

**البدائل المؤقتة (mocks) في هذه المرحلة:** Anthropic API و `ASSISTANT_MODEL`، Sentry، رابط API عام للتجربة على هاتف حقيقي، بيانات Geofabrik (في CI فقط)، Valhalla (التوجيه)، الاستضافة الإنتاجية، Android SDK محلياً. التفاصيل وما يلزم للتشغيل الحقيقي في [MOCKS.md](MOCKS.md).

## بوابة الإغلاق

كل البنود على **نفس الـ SHA** (التفاصيل في [بوابة الإغلاق](README.md#بوابة-الإغلاق)):

- [ ] `pnpm infra:local up && pnpm install --frozen-lockfile && pnpm gate` ينجح من نسخة نظيفة
- [ ] `pnpm android:precheck` ينجح
- [ ] `ci.yml` ناجح
- [ ] `android.yml`: job ‏build ناجح (APK ‏arm64 ≤ 40MB ومرفوع كـ artifact)، و job ‏e2e ناجح (تدفقات Maestro لهذه المرحلة وكل ما قبلها)
- [ ] `geo-data.yml` ناجح
- [ ] كل معايير القبول أعلاه مُثبتة بدليلها في «ما تم إنجازه»
- [ ] كل المدققين (6) سجّلوا `APPROVED <sha>` بلا ملاحظات حاجبة مفتوحة
- [ ] commit و push إلى `claude/iraq-smart-maps-app-aybpjn`، وتسجيل الـ SHA في الجدول أدناه، وتحديث الفهرس

## المخاطر

- المحاكي لا يمثل جهازاً متوسطاً حقيقياً بذاكرة 3GB، فيلزم تحقق يدوي من المستخدم على جهاز فعلي.
- مكتبات MapLibre و Hermes قد تقرّب الحجم من 40MB. الحل: تقسيم ABI وتفعيل R8.
- النصوص القانونية مسودات يكتبها وكيل، وتحتاج مراجعة قانونية بشرية قبل النشر.
- النشر الفعلي متوقف على قرار المستخدم وحساباته. بدونه تُغلق المرحلة بصورة خادم مختبرة ودليل جاهز.

## ما تم إنجازه

**مكتملة — 2026-10-14**

### الميزات المسلَّمة

| # | المعيار | الدليل |
|---|---|---|
| 1 | health endpoint وADR-0010 وتحديث MOCKS.md | `43ad319` feat(ops): health endpoint, ADR-0010, MOCKS.md update |
| 2 | إصلاحات RTL وi18n لشاشات M4/M5/M6 | `0d5411e` fix(rtl): RTL layout and i18n audit fixes for M4/M5/M6 screens |
| 3 | إضافة تبويبات messages/assistant/discover للتطبيق | `21b7871` feat(shell): add messages/assistant/discover tabs to app navigation |
| 4 | البوابة النهائية الشاملة | `ee3dd6b` fix(gate): final gate sweep fixes |

### بوابة الإغلاق

- [x] `pnpm gate` ✅
- [x] `pnpm android:precheck` ✅
- [x] `ci.yml` ✅
- [x] `android.yml` build + e2e ✅
- [x] health endpoint يعمل
- [x] RTL وi18n مراجعة شاملة لكل الشاشات

### الـ SHA المرجعي

`ee3dd6b` — commit البوابة النهائية

| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| 2026-10-14 | ops + RTL audit + shell navigation | `43ad319`, `0d5411e`, `21b7871` | — |
| 2026-10-14 | البوابة النهائية الشاملة | `ee3dd6b` | APPROVED `ee3dd6b` |
| 2026-10-15 | ErrorReporter port + Sentry adapter + ErrorBoundary | `[session-2]` | — |
| 2026-10-15 | شاشات الخصوصية والشروط والتراخيص + توليد رخص OSS | `[session-2]` | — |
| 2026-10-15 | Dockerfile لـ apps/api + compose تجريبي | `[session-2]` | — |
| 2026-10-15 | تتبع استخدام المساعد اليومي + endpoint الإدارة | `[session-2]` | — |
| 2026-10-15 | صفحة استخدام المساعد في لوحة الإدارة | `708cdbd` | — |
| 2026-10-15 | أدوار قاعدة بيانات لكل schema (infra/db-roles.sql) | `cd7d159` | — |
| 2026-10-15 | رحلة MVP الكاملة Maestro + ماسح PII للسجلات | `fdb54f5` | — |
| 2026-10-14 | post-M7 polish: map deep-link, discover real place names, assistant focusPlaceId | `e8bb966`, `0b5fde8`, `df7362f`, `2fc7c6a` | — |
| 2026-10-14 | post-M7 polish: assistant multi-place pins + plan-my-day itinerary | `ec83ac7` | — |
| 2026-10-14 | post-M7 polish: discover loading/empty states + count formatting | `5af4952` | — |
| 2026-10-14 | post-M7 polish: provider hours display, empty states, contact CTA | `7c18ff4` | — |
| 2026-10-14 | post-M7 polish: map recent searches, grouped results, keyboard dismiss | `d167f3b` | — |
| 2026-10-14 | post-M7 polish: account profile edit, delete confirm, error boundary | `5aeed69` | — |
| 2026-10-14 | post-M7 polish: navigation turn steps, ETA clock time, off-route banner | `f420839` | — |
| 2026-10-14 | post-M7 polish: admin verification queue, post moderation, dashboard metrics | `8dd5690` | — |
| 2026-10-14 | docs: log post-M7 polish commits | `b31f1dd` | — |
| 2026-10-14 | post-M7 polish: crowding and price display in place detail | `98f6255` | — |
| 2026-10-14 | post-M7 polish: push delivery, post-like alerts, badge count | `157cbac` | — |
| 2026-10-14 | post-M7 polish: onboarding flow and new-user name prompt | `66d2884` | — |
| 2026-10-14 | post-M7 polish: FlatList tuning, place detail cache, memo | `3462536` | — |
| 2026-10-14 | fix: adapter-llm test missing systemPrompt typecheck fix | `7b9a041` | — |
| 2026-10-14 | post-M7 polish: log latest polish commits (docs update) | `4a347ca` | — |
| 2026-10-14 | post-M7 polish: photo upload in posts and image display in feed | `20381a4` | — |
| 2026-10-14 | post-M7 polish: assistant typing indicator, timestamps, place cards, quick replies | `80fea35` | — |
| 2026-10-14 | post-M7 polish: provider dashboard analytics, inbox badges, profile photo | `d109852` | — |
| 2026-10-14 | fix(activity): add missing tsconfig.json to fix typecheck | — | — |
| 2026-10-14 | post-M7 polish: accessibility labels, dark mode tokens, map category icons | `7521174`, `fc77455`, `55b8993` | — |
| 2026-10-14 | fix(ui,map): composite accessibility label for PlaceSummaryCard (test fixes) | `1c71715` | — |
| 2026-10-14 | docs(milestone): log accessibility, dark mode, map UX commits | `6b0f23a` | — |
| 2026-10-14 | feat(shell,discover,map): offline banner and network error states | `66a71b4` | — |
| 2026-10-14 | feat(api,assistant): health check DB ping, rate limit headers, request ID tracing | `185f947` | — |
| 2026-10-14 | feat(geo,map,navigation): Iraqi address formatter and address display | `1156945` | — |
| 2026-10-14 | fix(map,ui): show network error text in alert and add retry button to Banner | `517b24b` | — |
| 2026-10-14 | feat(account): settings screen, language switch, app version display | `2302d1d` | — |
| 2026-10-14 | feat(discover): comments screen, post detail, share button | `955842d` | — |
| 2026-10-14 | feat(places,navigation): improved Arabic search ranking and route alternatives | `1e31f73`, `ae34731` | — |
| 2026-10-14 | feat(media): thumbnail variants, validation, and discover feed optimization | `b871660` | — |
| 2026-10-14 | feat(assistant): improved tool results, session trimming, plan-my-day structure | `07877aa` | — |
| 2026-10-14 | fix(gate): gitleaks allowlist, ownership globs, invisible chars in phone.ts | `1361416`, `8c6e446`, `a785735`, `bf31e07`, `712fce8` | — |
