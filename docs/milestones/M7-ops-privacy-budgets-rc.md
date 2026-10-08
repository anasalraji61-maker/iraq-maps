---
id: M7
slug: ops-privacy-budgets-rc
status: not_started
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
    - "tools/ownership/**"
    - "apps/api/**"
    - "apps/mobile/*"
    - "apps/mobile/app/**"
    - "apps/mobile/src/shell/**"
    - ".github/workflows/ci.yml"
    - ".github/workflows/android.yml"
    - "docs/milestones/**"
    - "docs/adr/**"
    - "docs/ARCHITECTURE.md"
    - "CLAUDE.md"
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

- [ ] **المراقبة والسجلات**
  - ErrorReporter في packages/observability.
  - محوّل متوافق مع Sentry في حزمة منفصلة، يتعطل تلقائياً بدون DSN، ويحذف البيانات الشخصية قبل الإرسال.
  - error boundary في التطبيق عبر mobile-kit.
  - أداة تفحص كل سجلات سيناريوهات e2e بحثاً عن هواتف وتوكنات وإحداثيات دقيقة.
- [ ] **تكلفة المساعد**
  تجميع يومي للاستهلاك والتكلفة، ولكل مستخدم بشكل مجمّع بلا بيانات شخصية، عبر endpoint للإدارة فقط، مع صفحة في لوحة الإدارة.
- [ ] **الخصوصية والشروط**
  - نصوص بالعربية ثم ckb و en تغطي: البيانات المجمعة، والموقع، ومعالجة LLM، والمراسلة، والموافقات، والحذف، والتواصل.
  - تُعرض داخل «حسابي»، مع صفحة HTML ثابتة في site/ لرابط Google Play.
  - شاشة الخصوصية: دقة الموقع، وملخص الموافقات، وحذف الحساب.
  - مسودة نموذج Data safety.
- [ ] **الميزانيات وجاهزية الإصدار**
  - p95 للبحث والمسار على بيانات حقيقية يصبح فحصاً حاجباً في geo-data.yml.
  - حجم APK مفروض منذ M0.
  - قياس زمن البدء البارد على المحاكي، ومحاكي API 26.
  - Dockerfile لـ apps/api مع smoke في CI، و compose لبيئة تجريبية، ودليل نشر يعتمد على قرار الاستضافة.
- [ ] **رحلات E2E كاملة**
  - رحلة Maestro: دخول، بحث، مسار، مساعد، مراسلة، رد مزوّد، اكتشف، نشاطي، ثم حذف الحساب.
  - اختبار API يثبت أن حذف الحساب يمسح بيانات المستخدم من كل الوحدات.
- [ ] **أدوار قاعدة بيانات لكل وحدة (مؤجل من M0)**
  - كل schema يُرحَّل بدور `<schema>_migrator` يملكها وحدها، بلا CREATE أو USAGE على غيرها.
  - التطبيق يعمل بدور تشغيل بصلاحيات DML فقط على schemas وحداته.
  - هذا يحوّل فحص db-kit المعجمي إلى عزل حقيقي في الإنتاج.

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

لم تبدأ بعد.

| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| | | | |
