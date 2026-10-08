---
id: M3
slug: providers-media-verification
status: not_started
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-providers:
    - "modules/providers/**"
  builder-media:
    - "modules/media/**"
    - "adapters/storage-s3/**"
  builder-places-provider:
    - "modules/places/**"
    - "mobile-features/map/**"
  builder-provider-app:
    - "mobile-features/provider/**"
    - "mobile-features/account/**"
    - "packages/mobile-kit/**"
    - "packages/ui/**"
  builder-admin:
    - "apps/admin/**"
  builder-e2e-m3:
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
    - "CLAUDE.md"
auditors:
  auditor-security-m3: security-privacy
  auditor-architecture-m3: architecture-contracts
  auditor-qa-m3: qa-build
  auditor-licensing-m3: licensing-data
  auditor-rtl-m3: arabic-rtl-a11y
---

# M3 — وضع المزوّد: التسجيل والمطالبة بمكان والصور والموافقات والتوثيق من لوحة الإدارة

**الحالة:** لم تبدأ · **التقدير:** 3.5–4 ساعة · **يعتمد على:** [M1](M1-map-search-place-card.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

يحوّل صاحب العمل حسابه إلى وضع المزوّد داخل نفس التطبيق، ثم:
- يوثّق هاتف العمل بـ OTP، وهذا إلزامي.
- يُدخل الاسم والفئة والموقع، أو يطالب بمكان OSM موجود.
- يرفع صوراً تُزال منها بيانات EXIF.
- يضيف الساعات ونطاقات الأسعار وروابط صفحاته.
- يمنح أو يسحب كل موافقة على حدة.

يوثّقه المشرف من لوحة الإدارة على الويب. بعدها تظهر صوره وهاتفه وروابطه وشارة التوثيق في بطاقة المكان وفي البحث، حسب الموافقات الفعّالة فقط. وتختفي من الطلب التالي مباشرة عند سحب الموافقة أو تعليق المزوّد.

الأسعار تُعرض على البطاقة في M5، مع الزحمة، عبر مسار عرض واحد.

## الميزات المطلوبة

- [ ] **وحدة providers**
  - مسودة المزوّد، وتوثيق هاتف العمل عبر PhoneVerificationPort.
  - المطالبة بمكان OSM.
  - الساعات ونطاقات الأسعار وروابط التواصل.
  - سجل موافقات غير قابل للتعديل {scope, grantedAt, revokedAt, evidence}، للنطاقات: photos و social_links و whatsapp_messages و show_phone و show_prices.
  - الحالات: pending ثم verified أو suspended.
  - صلاحية التعديل تُحسم بملكية سجل المزوّد.
  - ProviderProfilePort: ملف عام مفلتر بالموافقات، للمزوّد الموثّق فقط.
  - ProviderDirectoryPort: قنوات التواصل الموافق عليها، يُستهلك أولاً في M4.
  - الأحداث عبر outbox، وتنفيذ UserDataEraser.
- [ ] **وحدة media**
  - نية رفع بروابط موقّعة، مع حدود للنوع والحجم.
  - معالجة بـ sharp: تصغير، وإزالة كل EXIF وخصوصاً الموقع.
  - حدث media.asset.ready.v1، وروابط عرض موقّعة.
  - محرّك تخزين على الملفات للتطوير والاختبار و e2e.
  - محوّل S3 (يعمل مع R2 و MinIO) في حزمة adapter منفصلة.
  - UserDataEraser: يحذف الصفوف فوراً، والملفات عبر job.
- [ ] **فصل بيانات المزوّد في places وفلترة الموافقات وقت الطلب**
  - جدول places.provider_place منفصل عن جداول OSM، يُغذّى من أحداث المزوّد. يحوي المعرّف والاسم والفئة والموقع فقط، ليظهر المكان الجديد في البحث.
  - قسم المزوّد في التفاصيل (الصور والهاتف والروابط والتوثيق) يُقرأ وقت الطلب عبر ProviderProfilePort، بلا نسخ وبلا cache. لذلك يكون الإخفاء عند السحب أو التعليق فورياً.
- [ ] **ميزة المزوّد في التطبيق**
  - مدخل «وضع المزوّد» في حسابي.
  - معالج التسجيل: OTP، ثم الاسم والفئة، ثم الموقع على الخريطة أو المطالبة عبر البحث، ثم الصور والساعات والأسعار والروابط.
  - شاشة موافقات لكل نطاق، تشرح نتيجة السحب، مع السحب.
  - حالة التوثيق.
  - زر «هذا مكاني» في البطاقة يفتح المطالبة.
- [ ] **لوحة الإدارة: التوثيق**
  - تطبيق Vite و React بالعربية و RTL.
  - دخول بالهاتف و OTP مع التحقق من دور admin أو moderator.
  - قائمة طلبات التوثيق مع تفاصيل المطالبة والأدلة.
  - التوثيق أو التعليق مع ذكر السبب، وسجل تدقيق.

## خارج النطاق

- صندوق الوارد والمراسلات (M4).
- عرض الأسعار والزحمة على البطاقة (M5).
- منشورات اكتشف (M6).
- التوثيق الآلي والمدفوعات.

## العقود

يجمّدها المكامل في commit `chore(M3): freeze contracts` قبل أن يبدأ أي بنّاء (القواعد في [سياسة العقود](README.md#سياسة-العقود)). المحتوى المطلوب:

The integrator freezes contracts in 30 min or less. It adds:
- providers router: create draft; phone verify start and confirm; PATCH profile, hours, prices and links; claim; GET me; GET and PUT consents with grant and revoke
- media router: POST uploads {purpose, mime, size} returning {assetId, uploadUrl, headers}; POST complete; GET signed read URL
- admin/providers router: GET queue; POST verify; POST suspend {reason}
- the ConsentScope and MediaPurpose (provider_photo) enums
- ports: ProviderProfilePort, whose consent-filtered publicProfile includes prices only under show_prices; ProviderDirectoryPort.contactChannels; ObjectStorage; MediaPort
- events: providers.provider.verified.v1, providers.provider.suspended.v1, providers.consent.changed.v1, providers.profile.updated.v1, media.asset.ready.v1
- the PlaceDetails.provider? extension {verified, photos[], hours?, social[], phone?}
- fakes and conformance suites: FakeObjectStorage, FakeProviderProfile, FakeProviderDirectory, FakePhoneVerification
- a typed stub for mobile-kit uploadAsset
- route links for provider and admin, and testIDs
- env names: S3_*, MEDIA_STORAGE_DRIVER, MEDIA_SIGNING_SECRET
- ownership front-matter

## توزيع الوكلاء

### البنّاؤون

يعملون بالتوازي كوكلاء في الخلفية، كلٌّ داخل مساراته فقط (انظر [البناء المتوازي](README.md#دورة-حياة-المرحلة)).

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-providers` | `modules/providers/**` | وحدة providers كاملة:<br>• التسجيل وتوثيق الهاتف والمطالبة.<br>• الملف وسجل الموافقات بالأدلة.<br>• التوثيق والتعليق بواجهات محمية بالدور.<br>• ProviderProfilePort و ProviderDirectoryPort مع اجتياز conformance suites.<br>• الأحداث عبر outbox، و UserDataEraser. |
| `builder-media` | `modules/media/**`<br>`adapters/storage-s3/**` | • وحدة media: نية الرفع، ومحرّك الملفات، ومعالجة sharp مع إزالة EXIF، وحدث asset.ready، والروابط الموقّعة، و UserDataEraser.<br>• محوّل S3 يجتاز conformance suite لـ ObjectStorage. |
| `builder-places-provider` | `modules/places/**`<br>`mobile-features/map/**` | • جدول provider_place المنفصل، يُبنى من أحداث المزوّد ويُدمج في البحث.<br>• قسم المزوّد في التفاصيل عبر ProviderProfilePort وقت الطلب.<br>• في البطاقة: قسم المزوّد، وشارة التوثيق، وزر «هذا مكاني». |
| `builder-provider-app` | `mobile-features/provider/**`<br>`mobile-features/account/**`<br>`packages/mobile-kit/**`<br>`packages/ui/**` | • حزمة feature-provider: المعالج، والموقع أو المطالبة، والصور، والساعات والأسعار والروابط، والموافقات مع السحب، وحالة التوثيق، وتدفق Maestro.<br>• مدخل «وضع المزوّد» في حسابي.<br>• uploadAsset في mobile-kit، مع ضغط الصورة وإعادة المحاولة.<br>• مكوّنات المفاتيح (toggles) في packages/ui. |
| `builder-admin` | `apps/admin/**` | لوحة الإدارة على الويب:<br>• الدخول مع التحقق من الدور.<br>• قائمة التوثيق وتفاصيل الأدلة.<br>• التوثيق والتعليق مع السبب، وسجل التدقيق.<br>• i18n و RTL.<br>• اختبارات Vitest، وبناء إنتاجي. |
| `builder-e2e-m3` | `e2e/**` | • سيناريو التسجيل والتوثيق والسحب والتعليق.<br>• مجموعة التفويض.<br>• في الـ harness: محرّك تخزين الملفات، وخطوة توثيق إداري للمحاكي. |

### المكامل (integrator)

**يملك:** `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `turbo.json`، `.gitignore`، `.env.example`، `.gitleaks.toml`، `packages/tooling/**`، `packages/contracts/**`، `packages/testing/**`، `tools/ownership/**`، `apps/api/**`، `apps/mobile/*`، `apps/mobile/app/**`، `apps/mobile/src/shell/**`، `.github/workflows/ci.yml`، `.github/workflows/android.yml`، `docs/milestones/**`، `docs/adr/**`، `CLAUDE.md`

- ربط providers و media في apps/api، وربط ProviderProfilePort بـ places.
- مستهلكو أحداث providers في places، و worker معالجة الصور.
- مسار ملفات التخزين المحلي للتطوير و e2e.
- تسجيل UserDataEraser للوحدتين.
- مسارات شاشات المزوّد، وأذونات اختيار الصور في app.config.

### المدققون

لم يكتب أيٌّ منهم كود هذه المرحلة، ولا يعدّلون الكود؛ يرفعون الملاحظات لمالك الملف.

| الوكيل | العدسة | يفحص |
|---|---|---|
| `auditor-security-m3` | `security-privacy (mandatory: providers, media, admin)` | • الموافقات تُطبَّق في الخادم، لا في الواجهة فقط.<br>• لا cache يسرّب بيانات بعد السحب أو التعليق.<br>• الروابط الموقّعة قصيرة العمر ومحصورة بالمالك.<br>• حذف EXIF بالكامل.<br>• تفويض واجهات admin.<br>• المطالبة لا تنشر شيئاً قبل التوثيق.<br>• لا هواتف في السجلات.<br>• الـ OTP الثابت مرفوض في الإنتاج. |
| `auditor-architecture-m3` | `architecture-contracts` | • places لا تستورد providers، والربط عبر port وأحداث فقط.<br>• الأحداث بنسخ وتمر عبر outbox.<br>• محوّل S3 معزول في adapters.<br>• منطق الموافقات معرّف مرة واحدة.<br>• نجاح knip و jscpd، والملكية سليمة. |
| `auditor-qa-m3` | `qa-build` | • يشغّل سيناريو التسجيل والسحب بنفسه.<br>• يتحقق من مجموعات conformance والتفويض.<br>• يتحقق من بناء لوحة الإدارة.<br>• يتحقق من تدفق المحاكي وكل التدفقات السابقة لنفس الـ SHA. |
| `auditor-licensing-m3` | `licensing-data` | • فصل بيانات المزوّد عن جداول OSM.<br>• الروابط تُخزَّن وتُعرض فقط، بلا سحب محتوى من إنستغرام أو فيسبوك.<br>• الصور يرفعها المزوّد بموافقته.<br>• تراخيص sharp و libvips. |
| `auditor-rtl-m3` | `arabic-rtl-a11y` | • وضوح شرح كل موافقة ونتيجة سحبها بالعربية والكردية.<br>• المعالج ولوحة الإدارة في RTL.<br>• أحجام اللمس والتباين. |

## معايير القبول

| # | المعيار | طريقة التحقق |
|---|---|---|
| 1 | رحلة تسجيل المزوّد كاملة على الخادم، وسحب الموافقة يخفي البيانات فوراً | `pnpm --filter @iraq-maps/e2e-api test -- provider-onboarding`, step by step:<br>1. Submitting before the business-phone OTP returns 409.<br>2. Verify the OTP, claim the fixture OSM place, set hours, prices and links.<br>3. Upload a photo; asset.ready fires.<br>4. Grant the consents; the admin verifies.<br>5. GET /v1/places/:id shows photos, phone, links and the verified badge.<br>6. Revoke photos: the next GET has no photos.<br>7. Suspend: the next GET has no provider section.<br>8. The ledger shows the grant and the revoke with evidence. |
| 2 | المنافذ الحقيقية والمزيّفة تجتاز نفس مجموعات الاختبار | `pnpm --filter @iraq-maps/providers test` runs the ProviderProfilePort and ProviderDirectoryPort conformance suites, including: no field without an active consent, and nothing at all for unverified or suspended providers |
| 3 | التفويض محكم | e2e-api authz suite:<br>• a non-admin gets 403 on every admin endpoint<br>• a provider cannot edit another provider<br>• data of unverified or suspended providers is never public |
| 4 | الصور تُنظَّف من EXIF، والروابط الموقّعة محدودة، والتخزين يجتاز العقد | `pnpm --filter @iraq-maps/media test`: the GPS EXIF in the fixture JPEG is absent from the output (read with exifr); type and size limits are enforced; signed URLs expire.<br>The ObjectStorage conformance suite passes for the filesystem driver and, through `pnpm --filter @iraq-maps/adapter-storage-s3 test`, for the S3 adapter against a fake S3 HTTP server. |
| 5 | بيانات المزوّد مفصولة عن بيانات OSM | places SQL test:<br>• places.osm_* tables have no provider columns and are unchanged after a claim<br>• places.provider_place holds only id, name, category and location<br>depcruise is green. |
| 6 | حذف الحساب يحذف بيانات المزوّد والوسائط | The providers and media tests call their UserDataEraser and assert that the rows are purged and the file-removal job ran |
| 7 | لوحة الإدارة تعمل وتُبنى | `pnpm --filter @iraq-maps/admin test && pnpm --filter @iraq-maps/admin build`:<br>• OTP login and the role gate<br>• the queue renders<br>• verify and suspend call the right endpoints<br>• the page uses dir=rtl |
| 8 | شاشات المزوّد وقسم المزوّد في البطاقة تعمل | `pnpm --filter @iraq-maps/feature-provider test`: no completion before OTP; consent toggles with revoke confirmation; upload retry.<br>`pnpm --filter @iraq-maps/feature-map test`: provider sections render only when present; the verified badge; the claim link. |
| 9 | تسجيل المزوّد يعمل على محاكي أندرويد | android.yml e2e job green, including mobile-features/provider/maestro/onboarding.yaml. The admin verification step is done through the harness's admin API call, and all earlier flows also pass. |
| 10 | بوابة الجودة و CI وبناء أندرويد خضراء وموافقة المدققين ومنهم مدقق الأمان | `pnpm gate` exits 0 (it includes the admin build); ci.yml and android.yml are green for the head SHA; the audit log shows every auditor APPROVED, including auditor-security-m3 |

## المتطلبات البيئية والبدائل المؤقتة

- sharp prebuilt binaries from npm (@img/sharp-linux-x64 0.35.5 is on the registry). Fallback if they cannot install: jimp for resizing and EXIF removal.
- No S3 or MinIO locally (Docker is blocked). Dev and test use the filesystem driver, and the S3 adapter is tested against a fake S3 HTTP server (optionally a moto server from PyPI).
- An admin account seeded with the identity CLI (`grant-role <phone> admin`). No secrets are needed.
- The media signing secret and the field-encryption key are generated per run (local .env and CI). They are never in the repo.

**البدائل المؤقتة (mocks) في هذه المرحلة:** OTP عبر SMS أو WhatsApp، تخزين S3 / R2، رابط API عام للتجربة على هاتف حقيقي، Android SDK محلياً. التفاصيل وما يلزم للتشغيل الحقيقي في [MOCKS.md](MOCKS.md).

## بوابة الإغلاق

كل البنود على **نفس الـ SHA** (التفاصيل في [بوابة الإغلاق](README.md#بوابة-الإغلاق)):

- [ ] `pnpm infra:local up && pnpm install --frozen-lockfile && pnpm gate` ينجح من نسخة نظيفة
- [ ] `pnpm android:precheck` ينجح
- [ ] `ci.yml` ناجح
- [ ] `android.yml`: job ‏build ناجح (APK ‏arm64 ≤ 40MB ومرفوع كـ artifact)، و job ‏e2e ناجح (تدفقات Maestro لهذه المرحلة وكل ما قبلها)
- [ ] كل معايير القبول أعلاه مُثبتة بدليلها في «ما تم إنجازه»
- [ ] كل المدققين (5) سجّلوا `APPROVED <sha>` بلا ملاحظات حاجبة مفتوحة
- [ ] commit و push إلى `claude/iraq-smart-maps-app-aybpjn`، وتسجيل الـ SHA في الجدول أدناه، وتحديث الفهرس

## المخاطر

- نموذج الموافقات حساس قانونياً. نعالجه بفلترة وقت الطلب بلا cache، ومجموعة conformance، ومراجعة أمنية إلزامية.
- مطالبة احتيالية بمكان. التوثيق اليدوي إلزامي قبل ظهور أي بيانات.
- فهرس provider_place يُبنى من الأحداث فقد يتأخر قليلاً. يحوي حقولاً غير حساسة فقط، والحقول المشروطة بموافقة تُقرأ لحظياً.
- رفع الصور على شبكات ضعيفة. نضغط الصورة على العميل، ونرفع مباشرة برابط موقّع مع إعادة المحاولة.
- المرحلة فيها ستة بنّائين. لذلك يجب تجميد العقود بدقة لتقليل طلبات التعديل.

## ما تم إنجازه

لم تبدأ بعد.

| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| | | | |
