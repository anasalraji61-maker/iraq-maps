---
id: M6
slug: discover-activity-moderation
status: not_started
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-discover:
    - "modules/discover/**"
  builder-activity:
    - "modules/activity/**"
  builder-discover-app:
    - "mobile-features/discover/**"
  builder-activity-app:
    - "mobile-features/activity/**"
    - "mobile-features/map/**"
  builder-admin-moderation:
    - "apps/admin/**"
  builder-e2e-m6:
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
  auditor-security-m6: security-privacy
  auditor-architecture-m6: architecture-contracts
  auditor-qa-m6: qa-build
  auditor-rtl-m6: arabic-rtl-a11y
  auditor-licensing-m6: licensing-data
---

# M6 — اكتشف ونشاطي والإشراف على المحتوى

**الحالة:** لم تبدأ · **التقدير:** 3–3.5 ساعة · **يعتمد على:** [M3](M3-providers-media-verification.md)، [M4](M4-messaging-inbox-notifications.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

في «اكتشف» يتصفح المستخدم feed صور أماكن المدينة، من المزوّدين الموثّقين ومن المستخدمين. يستطيع:
- الإعجاب، والتعليق بمستوى واحد.
- المشاركة برابط iraqmaps://post/<id>.
- الإبلاغ عن محتوى.
- نشر صورة مرتبطة بمكان.

الضغط على منشور يفتح بطاقة المكان على الخريطة.

في «نشاطي» يجد:
- محفوظاته، مع زر «احفظ» في البطاقة.
- آخر مساراته.
- طلباته ومراسلاته.
- منشوراته.

ويراجع المشرف البلاغات في لوحة الإدارة ويخفي المحتوى أو يعيده.

## الميزات المطلوبة

- [ ] **وحدة discover**
  - المنشورات: صور معالجة من media، ومكان، ونص.
  - feed بترتيب بسيط حتمي، حسب المدينة والقرب والحداثة والتفاعل، مع pagination بالمؤشر.
  - إعجاب idempotent، وتعليق بمستوى واحد، وبلاغ مع سبب.
  - فلتر كلمات أولي يمر عبر المطبّع.
  - إخفاء من المشرف.
  - إخفاء منشورات المزوّد عند تعليقه أو سحب موافقة الصور، عبر علم يحدّثه مستهلك أحداث providers.
  - UserDataEraser.
- [ ] **وحدة activity**
  - الأماكن المحفوظة: إضافة وإزالة وقائمة، بشكل idempotent، مع UserDataEraser.
  - باقي أقسام «نشاطي» تُقرأ بلا read-model مكرر: من سجل المسارات المحلي، ومن واجهتَي المراسلات و discover.
- [ ] **تبويب اكتشف**
  - feed بقائمة افتراضية وصور مصغّرة.
  - إعجاب متفائل يتراجع عند الخطأ.
  - التعليقات، والمشاركة، والبلاغ.
  - إنشاء منشور: رفع الصورة عبر uploadAsset، واختيار المكان.
  - الانتقال إلى بطاقة المكان.
- [ ] **تبويب نشاطي وزر الحفظ**
  - الأقسام الأربعة، مع حالات فارغة.
  - طلباتي تفتح المحادثة، ومنشوراتي تفتح المنشور.
  - زر الحفظ في البطاقة.
- [ ] **الإشراف في لوحة الإدارة**
  قائمة البلاغات، وعرض المحتوى وسبب البلاغ، والإخفاء والإظهار مع سجل تدقيق، والتحقق من دور المشرف.

## خارج النطاق

- خوارزمية feed ذكية، والتعليقات المتداخلة.
- الرسائل بين المستخدمين، والفيديو، والمتابعة، والتقييم بالنجوم.

## العقود

يجمّدها المكامل في commit `chore(M6): freeze contracts` قبل أن يبدأ أي بنّاء (القواعد في [سياسة العقود](README.md#سياسة-العقود)). المحتوى المطلوب:

The integrator freezes contracts in 30 min or less. It adds:
- discover router: GET /v1/discover/feed?city&near&cursor; POST and DELETE posts; GET /v1/discover/posts/:id; POST and DELETE like; GET and POST comments (no parentId); POST report; GET /v1/discover/posts?author=me
- activity router: GET, PUT and DELETE /v1/activity/saved/:placeId
- admin/moderation router: GET the reports queue; POST hide and unhide
- the event discover.post.reported.v1, kept for future consumers; the admin reads the queue through the moderation route
- MediaPurpose 'post' (additive; media accepts any enum value with no code change)
- fakes and conformance suites for the discover and activity ports
- the iraqmaps://post/:id route link
- testIDs
- ownership front-matter

## توزيع الوكلاء

### البنّاؤون

يعملون بالتوازي كوكلاء في الخلفية، كلٌّ داخل مساراته فقط (انظر [البناء المتوازي](README.md#دورة-حياة-المرحلة)).

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-discover` | `modules/discover/**` | وحدة discover كاملة:<br>• المنشورات والـ feed، والإعجاب، والتعليق بمستوى واحد.<br>• البلاغات، والفلتر، والإخفاء.<br>• مستهلكو أحداث providers.<br>• UserDataEraser. |
| `builder-activity` | `modules/activity/**` | وحدة activity للمحفوظات، بشكل idempotent، مع conformance و UserDataEraser. |
| `builder-discover-app` | `mobile-features/discover/**` | حزمة feature-discover:<br>• الـ feed، والإعجاب، والتعليقات.<br>• المشاركة، والبلاغ.<br>• الإنشاء مع الرفع واختيار المكان.<br>• الانتقال إلى البطاقة.<br>• اختبارات RNTL، وتدفق Maestro. |
| `builder-activity-app` | `mobile-features/activity/**`<br>`mobile-features/map/**` | • حزمة feature-activity بأقسامها الأربعة وتدفق Maestro.<br>• زر الحفظ في البطاقة. |
| `builder-admin-moderation` | `apps/admin/**` | صفحات البلاغات والإخفاء في لوحة الإدارة، مع دور المشرف واختبارات Vitest. |
| `builder-e2e-m6` | `e2e/**` | • سيناريوهات المحتوى والإشراف والموافقات والتفويض.<br>• بيانات seed للمنشورات في الـ harness. |

### المكامل (integrator)

**يملك:** `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `turbo.json`، `.gitignore`، `.env.example`، `.gitleaks.toml`، `packages/tooling/**`، `packages/contracts/**`، `packages/testing/**`، `tools/ownership/**`، `apps/api/**`، `apps/mobile/*`، `apps/mobile/app/**`، `apps/mobile/src/shell/**`، `.github/workflows/ci.yml`، `.github/workflows/android.yml`، `docs/milestones/**`، `docs/adr/**`، `CLAUDE.md`

- ربط discover و activity ومستهلكي أحداث providers.
- تسجيل UserDataEraser.
- Android intent filters ومعالجة iraqmaps://post/:id في الـ shell.
- مسارات تبويبَي اكتشف ونشاطي.

### المدققون

لم يكتب أيٌّ منهم كود هذه المرحلة، ولا يعدّلون الكود؛ يرفعون الملاحظات لمالك الملف.

| الوكيل | العدسة | يفحص |
|---|---|---|
| `auditor-security-m6` | `security-privacy` | • تفويض الحذف لصاحب المحتوى، والإخفاء للمشرف.<br>• حدود النشر والتعليق والبلاغ.<br>• إخفاء هوية المبلّغ.<br>• إزالة EXIF من صور المستخدمين.<br>• الروابط لا تكشف محتوى مخفياً. |
| `auditor-architecture-m6` | `architecture-contracts` | • نشاطي لا يكرر بيانات الوحدات الأخرى.<br>• إعادة استخدام uploadAsset و PlaceSummaryCard.<br>• الروابط العميقة معرّفة مرة واحدة.<br>• discover يستهلك providers عبر الأحداث والـ ports فقط.<br>• نجاح knip و jscpd. |
| `auditor-qa-m6` | `qa-build` | • سيناريو الإشراف الكامل.<br>• اختبارات الترتيب الحتمية.<br>• أداء القائمة على محاكٍ بذاكرة 3GB.<br>• كل تدفقات المحاكي لنفس الـ SHA. |
| `auditor-rtl-m6` | `arabic-rtl-a11y` | • الـ feed والتعليقات في RTL.<br>• النصوص المختلطة.<br>• الحالات الفارغة.<br>• نصوص البلاغ.<br>• نص بديل للصور، وأحجام أزرار التفاعل. |
| `auditor-licensing-m6` | `licensing-data` | • احترام موافقة صور المزوّد.<br>• المحتوى يرفعه أصحابه، بلا سحب من منصات أخرى.<br>• الإسناد ظاهر على البطاقة المفتوحة من المنشور. |

## معايير القبول

| # | المعيار | طريقة التحقق |
|---|---|---|
| 1 | دورة المحتوى كاملة مع الإشراف والموافقات | `pnpm --filter @iraq-maps/e2e-api test -- discover`:<br>• a post appears in the city feed in deterministic score order<br>• like and unlike are idempotent<br>• replying to a comment returns 400<br>• a report appears in the admin queue<br>• after a moderator hides the post, it is gone from the feed and from its link<br>• a comment with a banned word in a different spelling is rejected<br>• suspending the provider or revoking its photos consent hides its posts once the outbox drains<br>• UserDataEraser purges posts, comments and likes |
| 2 | المحفوظات تعمل وتُحذف مع الحساب | `pnpm --filter @iraq-maps/activity test`: add, remove and list are idempotent; the UserDataEraser purges them |
| 3 | شاشات اكتشف تعمل | `pnpm --filter @iraq-maps/feature-discover test`:<br>• the feed<br>• optimistic like with rollback on error<br>• comments<br>• the share link<br>• the report flow<br>• create post (upload and place picker)<br>• tap a post to reach the place-card link |
| 4 | نشاطي يجمع الأقسام الأربعة، وزر الحفظ يعمل | `pnpm --filter @iraq-maps/feature-activity test`: saved places (API), recent routes (local store), my requests (messaging API, leading to the thread link), my posts (leading to the post link), and the empty states.<br>`pnpm --filter @iraq-maps/feature-map test -- save`: the save toggle. |
| 5 | صفحات الإشراف تعمل وتُبنى | `pnpm --filter @iraq-maps/admin test && pnpm --filter @iraq-maps/admin build`: the reports queue, hide and unhide, and the moderator role gate |
| 6 | اكتشف ونشاطي والرابط العميق تعمل على محاكي أندرويد | android.yml e2e job green, including:<br>• mobile-features/discover/maestro/feed-like-open-place.yaml: post, like, comment, open the place card, report<br>• mobile-features/activity/maestro/saved.yaml<br>• a Maestro openLink of iraqmaps://place/<fixtureId> showing the place card<br>All earlier flows also pass. |
| 7 | بوابة الجودة و CI وبناء أندرويد خضراء وموافقة المدققين | `pnpm gate` exits 0; ci.yml and android.yml are green for the head SHA; the audit log shows every auditor APPROVED |

## المتطلبات البيئية والبدائل المؤقتة

- No new external services. M6 builds on the M3 media pipeline and the M4 messaging APIs.
- Share links use the iraqmaps:// app scheme. https links with Android App Links need a domain and assetlinks.json (see MOCKS.md).

**البدائل المؤقتة (mocks) في هذه المرحلة:** تخزين S3 / R2، رابط API عام للتجربة على هاتف حقيقي، نطاق لروابط المشاركة، Android SDK محلياً. التفاصيل وما يلزم للتشغيل الحقيقي في [MOCKS.md](MOCKS.md).

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

- محتوى مسيء قبل وجود إشراف بشري كافٍ. نعالجه بفلتر كلمات، وبلاغات، وإخفاء سريع، بلا ML في MVP.
- أداء feed الصور على أجهزة بذاكرة 3GB. نستخدم صوراً مصغّرة وقوائم افتراضية.
- بدون نطاق لا تُفتح روابط https من خارج التطبيق.

## ما تم إنجازه

لم تبدأ بعد.

| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| | | | |
