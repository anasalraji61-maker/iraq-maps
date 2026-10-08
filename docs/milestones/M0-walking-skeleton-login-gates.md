---
id: M0
slug: walking-skeleton-login-gates
status: in_progress
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-platform:
    - "packages/config/**"
    - "packages/db-kit/**"
    - "packages/observability/**"
    - "infra/**"
  builder-identity:
    - "modules/identity/**"
  builder-ui-i18n:
    - "packages/ui/**"
    - "packages/i18n/**"
    - "docs/DATA_SOURCES.md"
  builder-mobile-shell:
    - "apps/mobile/src/shell/**"
    - "packages/mobile-kit/**"
    - "packages/api-client/**"
  builder-account-app:
    - "mobile-features/account/**"
  builder-osm-quality:
    - "geo-services/pipeline/**"
    - ".github/workflows/geo-data.yml"
    - "docs/reports/**"
  builder-gates-e2e:
    - ".github/workflows/ci.yml"
    - ".github/workflows/android.yml"
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
    - "modules/tour3d/**"
    - "mobile-features/tour3d/**"
    - "docs/milestones/**"
    - "docs/adr/**"
    - "docs/TASKS.md"
    - "docs/ARCHITECTURE.md"
    - "CLAUDE.md"
auditors:
  auditor-architecture-m0: architecture-contracts
  auditor-security-m0: security-privacy
  auditor-qa-m0: qa-build
  auditor-rtl-m0: arabic-rtl-a11y
  auditor-licensing-m0: licensing-data
---

# M0 — الهيكل الأولي العامل: تطبيق عربي بخمسة تبويبات وتسجيل دخول بالهاتف، مع بوابتَي CI وبناء أندرويد وتقرير جودة OSM

**الحالة:** قيد التنفيذ · **التقدير:** 3.5–4 ساعة (منها نحو 45 دقيقة انتظار لدورات CI) · **يعتمد على:** — · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

في نهاية المرحلة ينزّل المستخدم ملف APK كـ artifact من تشغيل android.yml في GitHub Actions ويثبّته. يفتح التطبيق بالعربية واتجاه RTL، وفيه خمسة تبويبات: الخريطة، اكتشف، مراسلات، نشاطي، حسابي.

تبويب «حسابي» يعمل بالكامل:
- تسجيل الدخول برقم الهاتف ورمز OTP.
- تعديل الاسم.
- اختيار اللغة (ar/ckb/en) مع حفظها.
- تسجيل الخروج.
- حذف الحساب.

التبويبات الأخرى تعرض حالة فارغة واضحة حتى تُسلَّم ميزاتها.

أين يعمل تسجيل الدخول:
- على محاكي أندرويد في CI: مُثبَت، ضد خادم يعمل داخل الـ job.
- على هاتف حقيقي: يعمل عندما يصل الهاتف إلى خادم، بضبط عنوانه من شاشة «إعدادات المطوّر».

ويحصل الفريق على:
- أمر جودة واحد يعمل محلياً وفي CI.
- بوابة بناء أندرويد آلية.
- تقرير جودة OSM لأربيل مقابل بغداد، مع ADR-0002 لاختيار المدينة الأولى.

## الميزات المطلوبة

- [ ] **هيكل الـ monorepo وبوابة الجودة الموحّدة**
  - pnpm workspaces مع Turborepo. إعدادات pnpm التي يحتاجها Expo تُوضع في pnpm-workspace.yaml، لأن ‎.npmrc مستثنى في ‎.gitignore.
  - حزمة tooling فيها:
    - tsconfig.
    - ESLint flat مع قاعدة منع النصوص الثابتة.
    - Vitest.
    - قواعد dependency-cruiser من §3، مضافاً إليها adapters/* و mobile-features/*.
  - gitleaks يُثبَّت عبر go install.
  - knip لكشف الكود الميت، و jscpd لكشف التكرار، بدل أي مقياس لعدد الأسطر.
  - tools/ownership يقرأ خريطة الملكية من ملف المرحلة.
  - الأمر pnpm gate يشغّل كل هذه الفحوص.
- [ ] **أساس الخادم**
  - packages/config:
    - يتحقق من متغيرات كل وحدة بـ zod عبر defineModuleConfig.
    - يرفض الإقلاع عند نقص متغير، ويرفض مرسلات OTP الوهمية في الإنتاج.
    - لا يطبع أي قيمة.
  - packages/observability: ‏logger (pino) يحذف أرقام الهواتف والتوكنات ويقرّب الإحداثيات، مع أداة لالتقاط السجلات في الاختبارات.
  - packages/db-kit:
    - Drizzle، و migrations مستقلة لكل schema.
    - قواعد اختبار معزولة من قالب فيه PostGIS و pg_trgm، على Postgres المحلي.
    - outbox مع relay ينشر عبر bus داخل العملية أو عبر BullMQ.
  - apps/api: ‏NestJS مع Fastify، و ‎/health، و OpenAPI.
- [ ] **الهوية وتسجيل الدخول بالهاتف**
  - رمز OTP:
    - يُخزَّن مُجزّأً (hashed)، بصلاحية محدودة وخمس محاولات.
    - حدود معدّل لكل رقم ولكل IP على Redis.
  - المرسل: fake للاختبار، و fixed لبيئة e2e، و console للتطوير فقط.
  - تشفير الهاتف بـ AES-GCM، مع hash للبحث.
  - الجلسات: access token قصير، و refresh مُدوَّر مع كشف إعادة الاستخدام.
  - الأدوار: user و provider و moderator و admin، مع أداة CLI لمنح الدور.
  - ‎/v1/me لقراءة الاسم واللغة وتعديلهما، ولحذف الحساب. الحذف يستدعي كل منافذ UserDataEraser المسجّلة، ثم ينشر identity.user.deleted.v1.
  - PhoneVerificationPort، لتوثيق هاتف المزوّد لاحقاً.
- [ ] **هيكل التطبيق العربي**
  - Expo مع Expo Router، و minSdk 26 (أندرويد 8+).
  - خمسة تبويبات بأسماء من i18n.
  - RTL للعربية والكردية، مع إعادة تحميل آلية عند تغيّر الاتجاه.
  - خط Noto Sans Arabic (ترخيص OFL).
  - التبويبات غير المسلَّمة تعرض مكوّن حالة فارغة واحداً من packages/ui.
  - design system أولي: تباين AA، وأحجام لمس لا تقل عن 48dp.
  - mobile-kit:
    - الجلسة في expo-secure-store.
    - عميل API يجدد التوكن عند 401.
    - روابط typed لكل شاشات MVP.
    - useRouteAvailable لإخفاء أي زر لم تُسلَّم شاشته بعد.
  - شاشة «إعدادات المطوّر» لعنوان الخادم، تظهر في النسخ غير الإنتاجية فقط. بهذا تخدم نسخة APK واحدة المحاكي وهاتف المستخدم.
- [ ] **i18n ومطبّع العربية**
  - runtime مستقل عن المنصة:
    - مساحة أسماء (namespace) لكل ميزة، ولغات ar و ckb و en.
    - اختبار تطابق المفاتيح بين اللغات الثلاث.
    - تنسيق الأرقام حسب اللغة.
  - المطبّع المشترك (يستعمله الخادم في الاستيراد والبحث):
    - أ/إ/آ←ا، و ة/ه، و ى/ي.
    - توحيد الياء والكاف الفارسيتين.
    - إزالة التشكيل والتطويل.
    - تحويل الأرقام الهندية.
    - الحفاظ على حروف السورانية (ڕ ۆ ێ ڵ ە).
- [ ] **ميزة الحساب**
  حزمة feature-account:
  - إدخال رقم عراقي (‎+964 7xx)، ثم الرمز مع مؤقت إعادة الإرسال، ثم الاسم واختيار اللغة.
  - تسجيل الخروج.
  - حذف الحساب بعد تأكيد صريح.
  - نصوصها في مساحة الأسماء account.
  - تدفق Maestro لتسجيل الدخول.
- [ ] **بوابتا CI وبناء أندرويد واختبار المحاكي**
  - ci.yml يشغّل pnpm gate مع حاويتي PostGIS و Redis.
  - android.yml فيه job للبناء:
    - expo prebuild ثم gradlew assembleRelease لمعمارية arm64، موقّع بمفتاح debug، والـ JavaScript مضمّن عبر Hermes.
    - فحص الحجم: 40MB أو أقل.
    - رفع ملف APK.
    - تعليقات ‎::error بآخر سطور السجل عند الفشل.
  - و job للمحاكي:
    - بناء x86_64، وتشغيل الخادم داخل الـ job ببيانات fixture و OTP ثابت.
    - Maestro: فتح التطبيق، والتبويبات العربية، وتبديل اللغة، وتسجيل الدخول.
- [ ] **تقرير جودة OSM واختيار المدينة الأولى**
  - ملفا erbil.yaml و baghdad.yaml.
  - سكربت مقاييس بـ osmium و pyosmium:
    - يحسب مقاييس بوابة القرار في MVP.md §1، ويطبّق قاعدة فارق 30%.
    - يُختبر على fixture يدوي بقيم معروفة مسبقاً.
  - job في geo-data.yml على GitHub runner:
    - ينزّل مستخرج Geofabrik للعراق، ويقص المدينتين، ويحسب التقرير.
    - يرفع التقرير كـ artifact، ومنه يُنسخ إلى docs/reports في commit المرحلة.
  - عدد المساهمين غير متاح، لأن المستخرج العام بلا معرّفات مستخدمين. يُسجَّل ذلك صراحة في التقرير.
- [ ] **حجز التجول ثلاثي الأبعاد**
  - نوع Tour3DPort في العقود.
  - ملف README فقط في modules/tour3d و mobile-features/tour3d.
  - بلا أي تنفيذ.

## خارج النطاق

- الخريطة والبحث (M1).
- مزوّد SMS حقيقي لإرسال OTP.
- استضافة الخادم والنشر على Google Play.
- نصوص سياسة الخصوصية والشروط (M7).

## العقود

يجمّدها المكامل في commit `chore(M0): freeze contracts` قبل أن يبدأ أي بنّاء (القواعد في [سياسة العقود](README.md#سياسة-العقود)). المحتوى المطلوب:

The integrator runs this freeze; it is the only long one, 60 min or less.

0. Probe push. Push a minimal ci.yml to claude/iraq-smart-maps-app-aybpjn to verify that this session may push workflow files and that Actions runs. Read the result through GitHub MCP. If it is refused, stop and ask the user.

1. Root scaffold:
- package.json with the scripts gate, infra:local, android:precheck, ownership:check and dev:api
- pnpm-workspace.yaml, including mobile-features/*, adapters/* and the Expo-compatible pnpm settings
- turbo.json
- the .gitignore fixture negations
- the .env.example sections
- .gitleaks.toml
- packages/tooling: tsconfig, ESLint with no-literal-string, the Vitest preset, the dependency-cruiser rules, and the knip and jscpd configs
- tools/ownership
- version pins: zod 3.25.76, and the Expo SDK and React Native versions that satisfy maplibre-react-native 11.5

2. Contracts v0:
- common: branded ids, LngLat, BBox, Locale ar|ckb|en, CityId, Problem, Paginated, and Estimate<T>{value, source, observedAt, confidence}
- HTTP routers: health; auth (otp/request, otp/verify, refresh, logout); me (GET, PATCH, DELETE)
- ports: IdentityPort, PhoneVerificationPort, OtpSender, UserDataEraser, EventBus, OutboxPublisher
- events: identity.user.registered.v1, identity.user.deleted.v1
- reserved: Tour3DPort
- testIDs for tabs and auth

3. packages/testing v0: FakeOtpSender, FixedClock, InMemoryEventBus, and conformance suites for OtpSender, EventBus and UserDataEraser.

4. Typed signature-only stubs for:
- config: defineModuleConfig
- db-kit: createTestDatabase and the outbox
- observability: createLogger and captureLogs
- i18n: registerNamespace, t, setLocale, normalizeArabic
- ui: component props
- mobile-kit: SessionProvider, useSession, useApi, the full MVP route-link map, useRouteAvailable, renderWithProviders
- api-client: createClient
- apps/api: createApp()

5. A minimal bootable Expo app (the apps/mobile root files plus a stub app/_layout), so builder-gates-e2e can iterate on android.yml from the first minute.

6. Docs: docs/milestones/README.md, _TEMPLATE.md, and the M0 file with its ownership front-matter.

Then run pnpm install, check that typecheck is green, and run ownership:check --plan.

## توزيع الوكلاء

### البنّاؤون

يعملون بالتوازي كوكلاء في الخلفية، كلٌّ داخل مساراته فقط (انظر [البناء المتوازي](README.md#دورة-حياة-المرحلة)).

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-platform` | `packages/config/**`<br>`packages/db-kit/**`<br>`packages/observability/**`<br>`infra/**` | • packages/config: ‏defineModuleConfig، مع رفض الإقلاع عند النقص، ورفض مرسلات الاختبار في الإنتاج، وعدم طباعة أي قيمة.<br>• packages/observability: ‏logger منقّح، وأداة لالتقاط السجلات في الاختبارات.<br>• packages/db-kit:<br>◦ عميل Drizzle، ومشغّل migrations لكل schema مع حماية الحدود.<br>◦ مصنع قواعد اختبار معزولة من قالب فيه PostGIS و pg_trgm.<br>◦ outbox مع relay عبر bus داخل العملية أو BullMQ.<br>• infra/local:<br>◦ pnpm infra:local up/down لتشغيل Postgres و Redis المحليين بدون Docker.<br>◦ docker-compose لأجهزة المطوّرين. |
| `builder-identity` | `modules/identity/**` | وحدة identity كاملة مع اختباراتها وملف README:<br>• OTP مع حدود المعدّل.<br>• مرسلات console و fixed محصورة ببيئات التطوير والاختبار.<br>• تشفير الهاتف مع hash للبحث.<br>• JWT مع refresh مُدوَّر وكشف إعادة الاستخدام.<br>• الأدوار، وأداة grant-role.<br>• ‎/v1/me: قراءة وتعديل وحذف. الحذف يستدعي منافذ UserDataEraser ثم ينشر الحدث عبر outbox.<br>• تنفيذ IdentityPort و PhoneVerificationPort، مع اجتياز conformance suites. |
| `builder-ui-i18n` | `packages/ui/**`<br>`packages/i18n/**`<br>`docs/DATA_SOURCES.md` | • packages/i18n: ‏runtime بمساحات أسماء، واختبار تطابق المفاتيح، وتنسيق الأرقام، والمطبّع العربي/الكردي مع اختباراته.<br>• packages/ui:<br>◦ tokens بتباين AA.<br>◦ مكوّنات RTL: ‏Screen و Text و Button و TextField و ListItem و Card و Sheet و Banner و EmptyState و IconButton.<br>◦ خط Noto Sans Arabic.<br>◦ اختبارات RNTL.<br>• تسجيل الخط وترخيصه OFL في DATA_SOURCES. |
| `builder-mobile-shell` | `apps/mobile/src/shell/**`<br>`packages/mobile-kit/**`<br>`packages/api-client/**` | • الـ shell:<br>◦ التخطيط الجذري، والتبويبات الخمسة، وفرض RTL مع إعادة التحميل.<br>◦ بوابة المصادقة واستعادة الجلسة.<br>◦ شاشة «إعدادات المطوّر» لعنوان الخادم في النسخ غير الإنتاجية.<br>• packages/api-client: عميل ts-rest يحقن التوكن ويجدده عند 401.<br>• packages/mobile-kit:<br>◦ الجلسة في SecureStore، و useApi.<br>◦ خريطة روابط typed لكل شاشات MVP، و useRouteAvailable.<br>◦ renderWithProviders للاختبارات. |
| `builder-account-app` | `mobile-features/account/**` | حزمة feature-account:<br>• شاشات الهاتف والرمز والاسم واللغة.<br>• تسجيل الخروج، وحذف الحساب بتأكيد صريح.<br>• نصوص مساحة الأسماء account باللغات الثلاث.<br>• اختبارات RNTL.<br>• تدفق Maestro: ‏maestro/login.yaml. |
| `builder-osm-quality` | `geo-services/pipeline/**`<br>`.github/workflows/geo-data.yml`<br>`docs/reports/**` | • ملفا المدينتين erbil.yaml و baghdad.yaml، مُتحقَّق منهما مقابل مخطط CityConfig.<br>• سكربت المقاييس وقاعدة القرار، مع fixture يدوي واختبارات pytest بقيم دقيقة.<br>• job الجودة في geo-data.yml: يعمل عند push بمرشح المسارات، ينزّل مستخرج Geofabrik ويقص المدينتين ويحسب المقاييس، ثم يرفع التقرير كـ artifact.<br>• package.json رفيع يشغّل pytest ضمن turbo. |
| `builder-gates-e2e` | `.github/workflows/ci.yml`<br>`.github/workflows/android.yml`<br>`e2e/**` | • ci.yml: ‏pnpm gate مع حاويتي postgis و redis.<br>• android.yml:<br>◦ job البناء: ‏prebuild، ثم assembleRelease لمعمارية arm64، وفحص الحجم، ورفع APK، وتعليقات ‎::error.<br>◦ job المحاكي: بناء x86_64، ثم تشغيل المحاكي، ثم Maestro.<br>• e2e/api: اختبارات المصادقة على createApp.<br>• e2e/mobile:<br>◦ harness يرفع الخادم داخل الـ job: ‏migrate و seed و NODE_ENV=e2e.<br>◦ تدفق launch-tabs.<br>• يبدأ التكرار على الـ workflow فوراً، على التطبيق الأولي القابل للإقلاع الذي يُنشأ عند التجميد.<br>• بعد M0 تنتقل ملكية ملفَي الـ workflow إلى المكامل. |

### المكامل (integrator)

**يملك:** `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `turbo.json`، `.gitignore`، `.env.example`، `.gitleaks.toml`، `packages/tooling/**`، `packages/contracts/**`، `packages/testing/**`، `tools/ownership/**`، `apps/api/**`، `apps/mobile/*`، `apps/mobile/app/**`، `modules/tour3d/**`، `mobile-features/tour3d/**`، `docs/milestones/**`، `docs/adr/**`، `docs/TASKS.md`، `docs/ARCHITECTURE.md`، `CLAUDE.md`

- يبدأ بتجربة دفع للتحقق من صلاحية دفع ملفات workflows، ثم يجري التجميد.
- في النهاية:
  - ربط identity في apps/api: حارس المصادقة، و createApp، و OpenAPI.
  - ملفات مسارات Expo Router: سطر واحد لكل شاشة.
  - app.config: ‏minSdk 26، و scheme iraqmaps، و expo-secure-store، و EXPO_PUBLIC_APP_ENV.
  - دمج الفروع، وإعادة pnpm install، ثم pnpm gate و android:precheck.
  - الدفع، ومتابعة CI عبر GitHub MCP.
- يكتب ADRs:
  - ADR-0002: المدينة الأولى من أرقام التقرير.
  - ADR-0003: نموذج التنفيذ والهيكل.
  - ADR-0004: قواعد الاختبار بلا Testcontainers.
  - ADR-0007: حذف الحساب عبر UserDataEraser.
  - ADR-0009: بناء أندرويد في Actions بلا EAS.
- يضيف قسم «نموذج التنفيذ» إلى CLAUDE.md بالقواعد الست، ويحدّث §3 في ARCHITECTURE.md.
- يعلّم TASKS.md بأنه مستبدَل.
- يملأ «ما تم إنجازه» في ملف المرحلة.

### المدققون

لم يكتب أيٌّ منهم كود هذه المرحلة، ولا يعدّلون الكود؛ يرفعون الملاحظات لمالك الملف.

| الوكيل | العدسة | يفحص |
|---|---|---|
| `auditor-architecture-m0` | `architecture-contracts` | • جودة العقود v0، وأنها قابلة للتوسع بالإضافة فقط.<br>• مطابقة قواعد dependency-cruiser لـ §3 مع الحزم الجديدة.<br>• نجاح ownership:check و knip و jscpd.<br>• أن كل بنّاء عدّل مساراته فقط، بمقارنة git diff لكل فرع.<br>• غياب التجريدات التي لا مستهلك لها.<br>• وجود ADR لكل انحراف. |
| `auditor-security-m0` | `security-privacy` | • تدفق OTP وحدوده ضد SMS pumping.<br>• تدوير refresh وكشف إعادة استخدامه.<br>• تشفير الهاتف، والمفتاح من env.<br>• رفض مرسلات الاختبار في الإنتاج.<br>• غياب البيانات الشخصية من السجلات.<br>• gitleaks، وخلو .env.example من أي قيمة.<br>• صلاحيات GITHUB_TOKEN في حدها الأدنى (contents: read)، ولا نشر لأي Release.<br>• أن EXPO_PUBLIC_ لا يحمل أسراراً. |
| `auditor-qa-m0` | `qa-build` | • يشغّل pnpm gate و android:precheck من نسخة نظيفة.<br>• ينفّذ كل معيار قبول بأمره.<br>• يتأكد أن الاختبارات حقيقية وتغطي حالات الفشل.<br>• يتحقق من نجاح ci.yml و android.yml بجزأيه (البناء والمحاكي) و geo-data.yml لنفس الـ SHA، ومن وجود APK وحجمه. |
| `auditor-rtl-m0` | `arabic-rtl-a11y` | • الاتجاه وتبديل اللغة.<br>• وضوح الخط العربي في لقطات المحاكي.<br>• أحجام اللمس والتباين.<br>• تسميات قارئ الشاشة للتبويبات وحقول الدخول.<br>• صياغة نصوص الدخول والحذف بالعربية والكردية. |
| `auditor-licensing-m0` | `licensing-data` | • تسجيل خط Noto (OFL) في DATA_SOURCES.<br>• استخدام مستخرج Geofabrik في CI وفق ODbL.<br>• منهجية تقرير الجودة وقاعدة القرار مطابقة لـ MVP.md.<br>• تراخيص حزم npm عبر pnpm licenses list. |

## معايير القبول

| # | المعيار | طريقة التحقق |
|---|---|---|
| 1 | بوابة الجودة الكاملة تنجح من نسخة نظيفة | `pnpm infra:local up && pnpm install --frozen-lockfile && pnpm gate` exits 0. The gate covers: build, lint, typecheck, test (including DB tests on local PostGIS + Redis), depcruise, gitleaks, knip, jscpd, and ownership:check --milestone M0 |
| 2 | فحص الملكية وقواعد الحدود يرفضان المخالفات | `pnpm --filter @iraq-maps/ownership test`: a diff that touches another owner's glob fails with a non-zero exit, and so do overlapping globs.<br>`pnpm --filter @iraq-maps/tooling test`: depcruise reports a violation for each of these fixtures:<br>• modules/a importing modules/b<br>• mobile-features/x importing mobile-features/y<br>• mobile-features importing modules<br>• adapters importing modules |
| 3 | الإعداد يرفض النقص والمرسل الوهمي في الإنتاج دون كشف أي قيمة | `pnpm --filter @iraq-maps/config test` |
| 4 | تسجيل الدخول يعمل على الخادم من البداية للنهاية، بما فيه التدوير والحذف | `pnpm --filter @iraq-maps/e2e-api test -- auth`, which runs:<br>1. Request an OTP (FakeOtpSender captures the code) and verify it.<br>2. Receive the access and refresh tokens.<br>3. GET /v1/me, then PATCH name and locale.<br>4. Refresh rotation: reusing an old refresh token revokes the whole token family.<br>5. DELETE /v1/me calls every bound UserDataEraser and writes identity.user.deleted.v1 to the outbox; afterwards, the old tokens get 401. |
| 5 | حدود المعدّل والمحاولات الخاطئة | `pnpm --filter @iraq-maps/identity test`: the 6th OTP request inside the window returns 429, and 5 wrong codes invalidate the OTP |
| 6 | رقم الهاتف مشفّر في القاعدة ولا يظهر في السجلات | An identity test reads the raw identity.users row and asserts the stored ciphertext is not the phone number.<br>A log-capture test, using the packages/observability helper during the auth e2e, finds no +964 or 07xxxxxxxxx patterns. |
| 7 | الـ outbox ينشر كل حدث مرة واحدة، وكل migration محصورة في schema وحدتها | `pnpm --filter @iraq-maps/db-kit test` against local PostGIS and redis-server:<br>• the relay delivers each event exactly once, with both the in-process bus and BullMQ<br>• a migration that touches another schema is rejected |
| 8 | خمسة تبويبات عربية RTL، وتبديل اللغة يعمل ويُحفظ | `pnpm --filter @iraq-maps/mobile test` (shell RNTL):<br>• tab labels come from i18n<br>• switching to en sets isRTL=false; ckb and ar set isRTL=true<br>• the language choice persists after a remount<br>• the developer server-URL screen exists only when EXPO_PUBLIC_APP_ENV is not production |
| 9 | شاشات الدخول والحساب تعمل | `pnpm --filter @iraq-maps/feature-account test`:<br>• Iraqi phone number validation<br>• OTP entry and the resend timer<br>• profile save<br>• logout<br>• delete-account confirmation, which calls DELETE /v1/me and clears the session |
| 10 | لا نصوص ثابتة، ومفاتيح اللغات الثلاث متطابقة، والمطبّع يوحّد الإملاء | The ESLint no-literal-string rule runs inside `pnpm gate`.<br>`pnpm --filter @iraq-maps/i18n test` checks:<br>• key parity across ar, ckb and en<br>• normalize: أربيل, إربيل and اربيل are equal<br>• ة/ه, ى/ي, tashkeel, tatweel and Indic digits are normalized<br>• the Sorani letters ڕ, ۆ, ێ, ڵ and ە are kept |
| 11 | فحص أندرويد محلي بدون SDK | `pnpm android:precheck` exits 0. It runs `expo prebuild --platform android --no-install` and then `expo export --platform android`. |
| 12 | بناء أندرويد ينجح والحجم ضمن الميزانية | The android.yml build job concludes success for the head SHA.<br>The job summary shows an arm64 APK of 40MB or less.<br>The APK artifact appears in GitHub MCP actions_list list_workflow_run_artifacts. |
| 13 | التطبيق يفتح ويسجّل الدخول على محاكي أندرويد | The android.yml e2e job concludes success. It runs two Maestro flows:<br>• e2e/mobile/flows/launch-tabs.yaml: 5 Arabic tab labels; switching to en flips a label.<br>• mobile-features/account/maestro/login.yaml: phone number, fixed e2e OTP, name saved, logout. |
| 14 | تقرير جودة المدينتين موجود مع ADR-0002 | `pnpm --filter @iraq-maps/geo-pipeline test` computes the exact metric values on the fixture.<br>The geo-data.yml quality job on a GitHub runner concludes success and uploads the report as a workflow artifact.<br>docs/reports/osm-quality-<date>.md contains every MVP.md §1 metric for Erbil and Baghdad, the computed decision, and an explicit note that the contributor count is unavailable.<br>docs/adr/0002-first-city.md cites the report. |
| 15 | التجول 3D محجوز بلا تنفيذ | packages/contracts exports the Tour3DPort type. modules/tour3d and mobile-features/tour3d contain a README only, and knip reports no implementation. |
| 16 | موافقة كل المدققين بلا ملاحظات حاجبة | The audit log in docs/milestones/M0-walking-skeleton-login-gates.md shows 'APPROVED <sha>' from every assigned auditor for the head SHA |

## المتطلبات البيئية والبدائل المؤقتة

- Local PostgreSQL 16.15: start the cluster with `pg_ctlcluster 16 main start` (installed, currently down), then create a role and a template DB with the postgis 3.4.2 and pg_trgm extensions (both installed).
- redis-server is installed locally; start it with `redis-server --daemonize yes`.
- Go is at /usr/local/go/bin/go and proxy.golang.org is reachable, so gitleaks can be installed with `go install`. osmium-tool is installed. pyosmium installs with pip.
- GitHub Actions must be enabled on anasalraji61-maker/iraq-maps with Workflow permissions set to read and write, and this session's credential must be allowed to push .github/workflows/*. This is unverified; the probe push at the start of the freeze checks it.
- GitHub MCP tools read CI status and logs (verified: actions_list returns 0 workflows). The gh CLI token is invalid.
- Geofabrik is reachable only from GitHub runners (blocked locally).
- No secrets are needed. OTP uses the fake sender in tests, the fixed sender in e2e and the console sender in dev. JWT and field-encryption keys are generated per CI run and kept in the local .env, never in the repo.
- Optional, not part of the gate: to try login on a real phone, the user needs an API the phone can reach, either `pnpm dev:api` on their computer on the same Wi-Fi with the server URL set in developer settings, or a staging server.

**البدائل المؤقتة (mocks) في هذه المرحلة:** OTP عبر SMS أو WhatsApp، رابط API عام للتجربة على هاتف حقيقي، بيانات Geofabrik (في CI فقط)، Android SDK محلياً. التفاصيل وما يلزم للتشغيل الحقيقي في [MOCKS.md](MOCKS.md).

## بوابة الإغلاق

كل البنود على **نفس الـ SHA** (التفاصيل في [بوابة الإغلاق](README.md#بوابة-الإغلاق)):

- [ ] `pnpm infra:local up && pnpm install --frozen-lockfile && pnpm gate` ينجح من نسخة نظيفة
- [ ] `pnpm android:precheck` ينجح
- [ ] `ci.yml` ناجح
- [ ] `android.yml`: job ‏build ناجح (APK ‏arm64 ≤ 40MB ومرفوع كـ artifact)، و job ‏e2e ناجح (تدفقات Maestro لهذه المرحلة وكل ما قبلها)
- [ ] `geo-data.yml` ناجح
- [ ] كل معايير القبول أعلاه مُثبتة بدليلها في «ما تم إنجازه»
- [ ] كل المدققين (5) سجّلوا `APPROVED <sha>` بلا ملاحظات حاجبة مفتوحة
- [ ] commit و push إلى `claude/iraq-smart-maps-app-aybpjn`، وتسجيل الـ SHA في الجدول أدناه، وتحديث الفهرس

## المخاطر

- قد يُرفض دفع ملفات workflows أو تكون Actions معطّلة. عندها يتوقف كل شيء ونطلب من المستخدم منح الصلاحية، أو إضافة الملفات من واجهة GitHub.
- Metro و Expo مع pnpm في monorepo قد يحتاجان nodeLinker مناسباً في pnpm-workspace.yaml. يُكتشف ذلك مبكراً لأن builder-gates-e2e يبني التطبيق الأولي من الدقيقة الأولى.
- ts-rest 3.52 يتطلب zod 3، بينما أحدث zod هو الإصدار 4. لذلك نثبّت zod 3.25.76، وأي ترقية تمر عبر ADR.
- التجميد في M0 كبير، وأي نقص فيه يكلّف دورة طلب تعديل عقد.
- المحاكي في CI قد يكون غير مستقر. الفحوص تعتمد على testIDs لا على البكسلات، وإعادة تشغيل واحدة مسموحة لأعطال البنية فقط.
- دورة CI تستغرق 15 إلى 25 دقيقة. نخفف ذلك بالفحص المحلي android:precheck قبل كل دفع، وبتجميع الإصلاحات.
- قد يتعذّر تشغيل تقرير الجودة في CI. عندها تبقى بوابة اختيار المدينة مفتوحة، ونبدأ M1 بأربيل كإعداد قابل للتبديل، ونسجّل ذلك كمتابعة.

## ما تم إنجازه

قيد التنفيذ.

| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| | | | |
