# المراحل (milestones): قواعد التنفيذ والفهرس

هذا الملف هو المرجع الملزم لطريقة التنفيذ. يحل محل `docs/TASKS.md`. لكل مرحلة ملف واحد في هذا المجلد يسجّل ميزاتها ومعاييرها ووكلاءها وتقدّمها، وقالبه [`_TEMPLATE.md`](_TEMPLATE.md). البدائل المؤقتة للخدمات الخارجية في [`MOCKS.md`](MOCKS.md). القرارات المعمارية في [`docs/adr/`](../adr/)، وأهمها هنا [ADR-0003](../adr/0003-milestone-execution-and-layout.md) و [ADR-0004](../adr/0004-local-postgis-instead-of-testcontainers.md) و [ADR-0009](../adr/0009-android-build-in-github-actions.md).

التنفيذ مستقل (autonomous) بموافقة المستخدم: لا توجد خطوة موافقة تحجب أي مرحلة. التوقف للمستخدم يحدث فقط عند عائق بيئي لا بديل له.

## القواعد الست الملزمة

1. **مراحل لا مهام متفرقة.** كل مرحلة تسلّم ميزات كاملة شغّالة يراها المستخدم من البداية للنهاية، في 2 إلى 4 ساعات من العمل المتواصل.
2. **عدد الأسطر ليس هدفاً أبداً.** المطلوب ميزات كاملة بأقل كود نظيف، بلا حشو ولا تكرار. التكرار والكود الميت يُكشفان بـ `jscpd` و `knip`، لا بعدّ الأسطر.
3. **بنّاؤون متوازيون على حزم منفصلة.** كل بنّاء يملك حزمة أو مسارات لا يلمسها غيره، ويلتزم بالعقود المجمّدة في `packages/contracts`.
4. **مدققون مستقلون.** المدقق لم يكتب كود المرحلة. يراجع، ويشغّل الاختبارات، ويجرّب البناء. كل ملاحظة تعود إلى البنّاء المالك فيصلحها في مكانها، ثم يُعاد التدقيق.
5. **بوابة الإغلاق.** لا تُغلق مرحلة إلا بنجاح كل الاختبارات وبناء أندرويد وموافقة المدققين على نفس الـ commit. بعدها commit و push، ثم المرحلة التالية.
6. **ملف واحد لكل مرحلة.** `docs/milestones/Mx-<slug>.md` يسجّل الميزات ومعايير القبول وتوزيع الوكلاء وما تم إنجازه.

## الفهرس

| المرحلة | العنوان | التقدير (ساعة) | يعتمد على | الحالة |
|---|---|---|---|---|
| [M0](M0-walking-skeleton-login-gates.md) | الهيكل الأولي العامل: تطبيق عربي بخمسة تبويبات وتسجيل دخول بالهاتف، مع بوابتَي CI وبناء أندرويد وتقرير جودة OSM | 3.5–4 (منها نحو 45 دقيقة انتظار لدورات CI) | — | **مكتملة** (`2937c16`) |
| [M1](M1-map-search-place-card.md) | خريطة المدينة والبحث العربي وبطاقة المكان | 3–4 | [M0](M0-walking-skeleton-login-gates.md) | قيد التنفيذ |
| [M2](M2-routing-navigation-satellite.md) | الاتجاهات والملاحة خطوة بخطوة وطبقة الأقمار الصناعية | 3–4 | [M1](M1-map-search-place-card.md) | لم تبدأ |
| [M3](M3-providers-media-verification.md) | وضع المزوّد: التسجيل والمطالبة بمكان والصور والموافقات والتوثيق من لوحة الإدارة | 3.5–4 | [M1](M1-map-search-place-card.md) | لم تبدأ |
| [M4](M4-messaging-inbox-notifications.md) | محرك المراسلات: طلب واحد لعدة أماكن، والقنوات والحالات والردود، وصندوق وارد المزوّد والإشعارات | 3–4 | [M3](M3-providers-media-verification.md) | لم تبدأ |
| [M5](M5-assistant-insights.md) | المساعد الذكي بالعربية، والأسعار والزحمة مع مصدرها | 3–4 | [M2](M2-routing-navigation-satellite.md)، [M4](M4-messaging-inbox-notifications.md) | لم تبدأ |
| [M6](M6-discover-activity-moderation.md) | اكتشف ونشاطي والإشراف على المحتوى | 3–3.5 | [M3](M3-providers-media-verification.md)، [M4](M4-messaging-inbox-notifications.md) | لم تبدأ |
| [M7](M7-ops-privacy-budgets-rc.md) | التشغيل والخصوصية وميزانيات الأداء ونسخة مرشّحة للإطلاق التجريبي | 3–3.5 | [M5](M5-assistant-insights.md)، [M6](M6-discover-activity-moderation.md) | لم تبدأ |

الحالات: «لم تبدأ» ← «قيد التنفيذ» ← «مكتملة» (مع SHA الإغلاق في ملف المرحلة).

## الفرع والإغلاق

- كل العمل وكل push على فرع واحد: `claude/iraq-smart-maps-app-aybpjn`. لا فروع milestone/* ولا فروع للبنّائين ولا tags ولا فرع data/reports ولا GitHub Releases.
- البنّاؤون والمدققون لا يكتبون commits. المكامل وحده يكتب commits ويدفعها.
- «الإغلاق» يعني: البوابة خضراء، ثم commit و push إلى الفرع، ثم تسجيل الـ SHA في ملف المرحلة.
- ملف APK يُسلَّم كـ artifact من تشغيل `android.yml` في GitHub Actions، وكذلك مخرجات بيانات المدينة من `geo-data.yml` و `imagery.yml`.

## دورة حياة المرحلة

1. **فحص الجاهزية (المكامل).** يشغّل أوامر التحقق من المتطلبات البيئية للمرحلة: PostGIS و Redis المحليان، وإصدارات الأدوات، والشبكة، و `actions_list` عبر GitHub MCP. العائق الذي لا بديل له يوقف المرحلة ويُرفع للمستخدم؛ لا يُخفَّض النطاق ولا البوابة بصمت. ما يحتاج مفتاحاً أو حساباً خارجياً ليس عائقاً: يُستبدل بـ mock ويُسجَّل في [`MOCKS.md`](MOCKS.md).
2. **ملف المرحلة.** يُنشأ من [`_TEMPLATE.md`](_TEMPLATE.md) مع front-matter الملكية، وهو المصدر الوحيد الذي يقرؤه `ownership:check`. تُحدَّث حالة المرحلة في الفهرس إلى «قيد التنفيذ».
3. **تجميد العقود (المكامل وحده؛ 60 دقيقة أو أقل في M0، و 30 بعدها).** انظر [سياسة العقود](#سياسة-العقود). ينتهي بـ `pnpm install`، و typecheck أخضر، و `pnpm ownership:check --milestone Mx`، ثم commit `chore(Mx): freeze contracts` و push.
4. **البناء المتوازي.** كل البنّائين يعملون بالتوازي كوكلاء في الخلفية (background agents) في نسخة العمل نفسها، كلٌّ داخل مساراته فقط. عدد الوكلاء المتزامنين محدود؛ إن زاد البنّاؤون عن الحد يُشغَّلون على دفعات بنفس قواعد الملكية.
   - كل منفذ (port) مستهلك يُستخدم عبر fake من `packages/testing`. لا يعمل بنّاء mock لكود لا يملكه.
   - يكتب البنّاء الكود، والاختبارات بجانبه، و README الحزمة (المنافذ المقدَّمة والمستهلكة، ومتغيرات env)، وتدفقات Maestro الخاصة به.
   - قبل التسليم: `pnpm turbo run lint typecheck test --filter=<own packages>...` و `pnpm ownership:check --milestone Mx --agent <builder>`، ثم تقرير ذاتي يربط عمله بمعايير القبول.
   - نقص في العقد يُكتب في `docs/contract-requests/Mx-<builder>.md`، ولا يُعدَّل العقد مباشرة.
   - يبقى البنّاء متاحاً حتى الإغلاق لاستقبال الإصلاحات.
5. **التكامل (المكامل، 45 دقيقة أو أقل).** انظر [سياسة التكامل](#سياسة-التكامل). ينتهي بـ `pnpm gate` على PostGIS و Redis المحليين، و `pnpm android:precheck`.
6. **تشغيل البوابة.** commit و push إلى `claude/iraq-smart-maps-app-aybpjn`. تعمل على الـ SHA نفسه: `ci.yml`، و `android.yml` (build و e2e)، و `geo-data.yml` / `imagery.yml` إن تغيّر `geo-services/**`. يقرأ المكامل النتائج وتعليقات `::error` والسجلات لهذا الـ SHA تحديداً عبر GitHub MCP (`actions_list`، `actions_get`، `get_job_logs`)، لأن رمز gh CLI غير صالح. تُجمَّع الإصلاحات لأن دورة CI تستغرق 15 إلى 25 دقيقة.
7. **التدقيق المستقل.** انظر [حلقة التدقيق](#حلقة-التدقيق).
8. **حلقة الإصلاح.** الملاحظة الحاجبة تعود إلى البنّاء المالك للملف، فيصلحها في مكانها ويضيف اختبار انحدار. يعيد المكامل `pnpm gate` و `android:precheck` ويدفع. يتحقق المدقق صاحب الملاحظة منها، ويعيد كل مدقق قائمته على الـ SHA الجديد. ثلاث جولات كحد أقصى، ثم يقرر القائد (lead). الملاحظات غير الحاجبة تصبح متابعات في ملف المرحلة التالية.
9. **الإغلاق.** عندما تتحقق [بوابة الإغلاق](#بوابة-الإغلاق) على SHA واحد، يملأ المكامل «ما تم إنجازه»: الميزات المسلَّمة لكل معيار مع الدليل، والـ SHA وأرقام تشغيلات CI، وحجم الـ APK واسم الـ artifact، وأرقام البيانات الحقيقية (p95 والأعداد)، وجولات التدقيق والملاحظات المصلحة، والانحرافات و ADRs، والمتابعات، والفحوص الحية التي لم تُنفَّذ لغياب مفتاح. ثم commit `docs(Mx): close milestone` و push، وتصبح الحالة «مكتملة».
10. **المرحلة التالية** تبدأ آلياً من الخطوة 1.

## سياسة العقود

- **مالك واحد.** `packages/contracts` و `packages/testing` يملكهما المكامل وحده في كل مرحلة (contracts steward).
- **كل شيء في commit التجميد، قبل أي بنّاء:** ‏routers ‏ts-rest تحت `/v1`؛ المنافذ وواجهات المحوّلات الخارجية؛ الأحداث المرقّمة `<module>.<entity>.<verb>.v1` التي تُنشر عبر outbox فقط؛ الـ enums والمخططات المشتركة (`TileSchema`، `PlaceImportRecord`، `CityDescriptor`، `Estimate<T>`)؛ عقود CLI بين geo-services والـ workflows؛ روابط المسارات typed؛ و testIDs لـ Maestro.
- **ما تحتاجه المرحلة فقط.** لا منافذ تخمينية ولا أحداث بلا مستهلك؛ يفرض ذلك مدقق المعمارية و `knip`.
- **fakes و conformance suites.** لكل منفذ fake في الذاكرة و suite مشتركة يجتازها الـ fake والتنفيذ الحقيقي معاً، فلا ينحرف الـ fake.
- **stubs للحزم المشتركة.** أي API في حزمة مشتركة يستهلكها بنّاء آخر في نفس المرحلة (ui، mobile-kit، map-kit، geo، db-kit، api-client، `createApp`) تُجمَّد كتوقيع typed فقط.
- **التوافق.** `packages/contracts` يعتمد على zod فقط، مثبّتاً على 3.25.76 من أجل ts-rest. التغيير داخل `/v1` إضافي فقط؛ التغيير الكاسر يحتاج `/v2` أو حدث `.v2` مع ADR.
- **أثناء البناء.** البنّاؤون لا يعدّلون العقود. الطلب في `docs/contract-requests/Mx-<builder>.md` يطبّقه المكامل كتجميد صغير إضافي واحد. مدقق المعمارية يقارن المرحلة بـ commit التجميد ويرفض أي انحراف غير معلن.
- **التحقق.** كل مدخل خارجي يُتحقق منه بهذه المخططات. التطبيق ولوحة الإدارة يصلان للخادم عبر `packages/api-client` فقط.

## سياسة التكامل

- **مكامل واحد لكل مرحلة.** لا يكون بنّاءً ولا مدققاً في نفس المرحلة، ولا يعيد كتابة كود البنّائين؛ كل عيب يعود لمالكه.
- **الدمج.** البنّاؤون على مسارات منفصلة في نفس نسخة العمل، فلا تعارض إلا في `pnpm-lock.yaml`، ويُعاد توليده بـ `pnpm install` ولا يُدمج يدوياً.
- **الربط مرتين في كل مرحلة:** كـ stubs أثناء التجميد ليقلع الخادم والتطبيق للبنّائين، ثم كربط حقيقي أثناء التكامل:
  - `apps/api` (composition root): تسجيل وحدات Nest، وربط المنافذ بالوحدات أو المحوّلات بما فيها قائمة `UserDataEraser[]`، ومستهلكو outbox، و workers ‏BullMQ، و OpenAPI، و `createApp()` لاختبارات e2e.
  - `apps/mobile`: ملفات مسارات Expo Router (سطر re-export واحد لكل شاشة)، و plugins والأذونات في `app.config`، و `available-routes.ts`.
- **الـ workflows رفيعة.** تشغيل الخدمات في سكربتات يملكها البنّاؤون (مثل harness ‏`e2e/mobile`)، فنادراً ما تتغير الـ workflows.
- **مهام المكامل الأخرى:** فحص الجاهزية، والتجميد، والـ push ومتابعة CI عبر GitHub MCP، وتوجيه الإصلاحات، و commit الإغلاق.

## ملكية الملفات المشتركة

| المسار | المالك في M0 | المالك من M1 |
|---|---|---|
| `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `turbo.json`، `.gitignore`، `.env.example`، `.gitleaks.toml` | المكامل | المكامل |
| `packages/contracts/**`، `packages/testing/**`، `packages/tooling/**`، `tools/ownership/**` | المكامل | المكامل |
| `apps/api/**` | المكامل | المكامل |
| `apps/mobile/*`، `apps/mobile/app/**` | المكامل | المكامل |
| `apps/mobile/src/shell/**` | `builder-mobile-shell` | المكامل |
| `.github/workflows/ci.yml`، `.github/workflows/android.yml` | `builder-gates-e2e` | المكامل |
| `.github/workflows/geo-data.yml` | `builder-osm-quality` | بنّاء البيانات في المرحلة (M1 `builder-geo-data`، M2 `builder-routing`، M7 `builder-release-budgets`) |
| `.github/workflows/imagery.yml` | — | `builder-imagery` (M2) |
| `e2e/**` | `builder-gates-e2e` | بنّاء e2e في المرحلة (`builder-e2e-mx`) |
| `docs/DATA_SOURCES.md` | `builder-ui-i18n` | بنّاء البيانات في المرحلة (M1 `builder-geo-data`، M2 `builder-imagery`) |
| `docs/milestones/**`، `docs/adr/**`، `CLAUDE.md`، `docs/ARCHITECTURE.md`، `docs/TASKS.md` | المكامل | المكامل |
| `docs/contract-requests/Mx-<agent>.md` | الوكيل الطالب | الوكيل الطالب |

الحزم المشتركة الأخرى (`packages/ui`، `packages/mobile-kit`، `packages/map-kit`، `packages/geo`، `mobile-features/map`، `apps/admin`، `modules/places`) يملكها بنّاء واحد في كل مرحلة، كما يحدده جدول الوكلاء في ملف المرحلة. `pnpm ownership:check` يرفض أي تداخل بين الـ globs، وأي ملف معدَّل خارج مسارات مالكه.

## حلقة التدقيق

كل عدسة يشغّلها وكيل جديد في كل مرحلة، لم يكتب كوداً فيها:

| العدسة | المراجع القديم | متى | ماذا تفحص |
|---|---|---|---|
| `architecture-contracts` | R1 | كل مرحلة | الحدود و depcruise، والملكية، وانحراف العقود عن commit التجميد، ومنع الربط بين schemas، و knip و jscpd، وغياب التجريدات التخمينية |
| `qa-build` | R4 | كل مرحلة | `pnpm gate` وكل أوامر القبول من نسخة نظيفة، واختبارات حقيقية تغطي حالات الفشل، و `ci.yml` و `android.yml` (حجم APK و Maestro) و workflows البيانات لنفس الـ SHA |
| `security-privacy` | R2 | إلزامية عند تغيّر identity أو providers أو messaging أو media أو الإدارة | الأسرار، والصلاحيات على كل مسار، وحدود المعدّل، والبيانات الشخصية في السجلات وإلى LLM، والموافقات على الخادم، و EXIF، وتواقيع webhooks، وصلاحيات رمز CI |
| `licensing-data` | R3 | حسب المسارات | `DATA_SOURCES.md`، وفصل ODbL، والإسناد، والخطوط والصور الفضائية، وتراخيص npm و Maven و PyPI |
| `arabic-rtl-a11y` | R5 | كل مرحلة فيها واجهة | لا نصوص ثابتة، و RTL، وصياغة العربية والكردية، وتباين AA، ولمس 48dp، وتسميات قارئ الشاشة |
| `assistant-evals` | R6 | M5 و M7 | التأريض، واستخدام الأدوات، وعدم الإرسال بلا تأكيد، والبيانات الشخصية، والحدود والتكلفة |

- بين 4 و 6 عدسات لكل مرحلة حسب المسارات المتأثرة، و M7 تشغّل العدسات الست.
- المدقق لا يعدّل الكود. يشغّل `pnpm gate` وكل أمر قبول بنفسه من نسخة نظيفة، ويراجع الفرق منذ commit التجميد.
- كل ملاحظة منظّمة: id، والعدسة، والخطورة (حاجبة أو ثانوية)، و `file:line`، والمالك من front-matter الملكية، وأمر إعادة الإنتاج مع مخرجاته، والسلوك المتوقع. يسجّلها المكامل في ملف المرحلة.
- الملاحظة الحاجبة تعود للبنّاء المالك فيصلحها في مكانها مع اختبار انحدار، ثم إعادة تدقيق على الـ SHA الجديد. ثلاث جولات كحد أقصى، ثم يقرر القائد.
- ينهي كل مدقق بـ `APPROVED <sha>` أو `REJECTED <sha>`.

## بوابة الإغلاق

لا تُغلق المرحلة إلا إذا تحقق كل ما يلي على **نفس الـ SHA** من `claude/iraq-smart-maps-app-aybpjn`:

1. `pnpm infra:local up && pnpm install --frozen-lockfile && pnpm gate` ينجح من نسخة نظيفة. البوابة تشمل: build، و lint، و typecheck، وكل اختبارات Vitest و Jest/RNTL بما فيها اختبارات القاعدة على PostGIS و Redis المحليين، وسيناريوهات `e2e/api`، و depcruise، و gitleaks، و knip، و jscpd، و `ownership:check`.
2. `pnpm android:precheck` ينجح.
3. `ci.yml` ناجح، بنفس البوابة على حاويات خدمة postgis و redis.
4. `android.yml` ناجح: job ‏build (prebuild ثم `assembleRelease` لـ arm64-v8a، و APK مرفوع كـ artifact بحجم 40MB أو أقل)، و job ‏e2e (كل تدفقات Maestro لهذه المرحلة وما قبلها على المحاكي). إعادة تشغيل آلية واحدة مسموحة لأعطال بنية المحاكي الموثّقة فقط، لا لأعطال التطبيق.
5. `geo-data.yml` و `imagery.yml` ناجحان إن تغيّر `geo-services/**`.
6. كل معيار قبول في ملف المرحلة مُثبت بدليله.
7. كل مدقق مكلَّف سجّل `APPROVED <sha>` بلا ملاحظات حاجبة مفتوحة.
8. قسم «ما تم إنجازه» مكتمل.

بعدها فقط: commit و push إلى `claude/iraq-smart-maps-app-aybpjn`، وتسجيل الـ SHA في ملف المرحلة، ثم المرحلة التالية. الفحوص الحية التي تحتاج مفاتيح المستخدم (Anthropic، WhatsApp، FCM، Sentry) لا تحجب الإغلاق، لكنها تُسجَّل صراحة كـ «نُفّذت» أو «لم تُنفّذ». لا يُتنازل عن أي معيار بصمت؛ أي انحراف يُسجَّل في ملف المرحلة مع قرار القائد وسببه.

## آلية بوابة بناء أندرويد

القرار في [ADR-0009](../adr/0009-android-build-in-github-actions.md). الخلاصة:

- **لماذا Actions.** Android SDK لا يُثبَّت محلياً (dl.google.com محجوب)، و EAS غير متاح (api.expo.dev محجوب ولا `EXPO_TOKEN`). البوابة هي `.github/workflows/android.yml` على `ubuntu-latest`، وفيه SDK و NDK و KVM.
- **التشغيل.** عند push إلى `claude/iraq-smart-maps-app-aybpjn` و main. `workflow_dispatch` معلن لكنه لا يعمل قبل وصول الملف للفرع الافتراضي، لذلك الـ push هو المسار الأساسي.
- **job ‏build.** Node 22 و pnpm 10 و JDK 17 مع caches؛ `pnpm install --frozen-lockfile`؛ `pnpm --filter @iraq-maps/mobile exec expo prebuild -p android --clean --no-install` (CNG، ومجلد `apps/mobile/android` مستثنى من git)؛ `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a` موقّعاً بمفتاح debug القالب، فيُضمَّن JavaScript عبر Metro و Hermes وتُكشف الاستيرادات المكسورة؛ كتابة حجم APK في ملخص الـ job والفشل فوق 40MB؛ رفع APK كـ artifact؛ تعليقات `::error` بآخر سطور Gradle أو Metro عند الفشل. صلاحيات الرمز `contents: read` فقط، ولا أسرار.
- **job ‏e2e.** APK ‏x86_64 مع `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` و `EXPO_PUBLIC_APP_ENV=e2e`؛ حاويتا postgis و redis؛ harness ‏`e2e/mobile` يجري migrate و seed ويشغّل `apps/api` بـ `APP_ENV=e2e` و OTP ثابت وتخزين على الملفات و LLM مبرمج (ومن M2 ‏`valhalla_service` على بلاطات fixture)، و `packages/config` يرفض كل هذه المرسلات في الإنتاج؛ محاكي API 34 ‏x86_64 (google_apis)؛ Maestro على `e2e/mobile/flows/*.yaml` و `mobile-features/*/maestro/*.yaml` بـ testIDs لا بالبكسلات؛ رفع لقطات الشاشة لمدقق RTL في كل تشغيل. في M7 يضاف محاكي API 26 وقياس البدء البارد.
- **فحص محلي قبل كل push.** `pnpm android:precheck` (`expo prebuild --no-install` و `expo export -p android`) بلا SDK، يكشف أخطاء config plugins و Metro مبكراً.
- **قراءة النتائج** لنفس الـ SHA عبر GitHub MCP.
- **شرط مسبق.** Actions مفعّلة على المستودع بصلاحيات read and write للـ workflows، ورمز هذه الجلسة يسمح بدفع `.github/workflows/*`. أول خطوة في تجميد M0 تجربة دفع لـ `ci.yml` بسيط؛ إن رُفضت تتوقف M0 ويُبلَّغ المستخدم.

## تغطية MVP

| بند MVP | المرحلة |
|---|---|
| OSM quality report Erbil vs Baghdad + first-city ADR-0002 (old T01) | [M0](M0-walking-skeleton-login-gates.md) |
| 3D tour reserved (Tour3DPort + README folders only) | [M0](M0-walking-skeleton-login-gates.md) |
| Generic per-city pipeline (city = config) | [M0](M0-walking-skeleton-login-gates.md) (city YAML), [M1](M1-map-search-place-card.md) (pipeline) |
| Vector PMTiles map with ar → ckb → name labels and ar/ckb/en map-language switch | [M1](M1-map-search-place-card.md) |
| Current location and center on it | [M1](M1-map-search-place-card.md) |
| OSM attribution always visible; imagery attribution when satellite is on | [M1](M1-map-search-place-card.md), [M2](M2-routing-navigation-satellite.md) |
| Arabic search for places and addresses with spelling normalization | [M0](M0-walking-skeleton-login-gates.md) (normalizer), [M1](M1-map-search-place-card.md) (search) |
| Place card: name, category, hours (open now), share | [M1](M1-map-search-place-card.md) |
| Place card: verified-provider photos, phone with consent, social links | [M3](M3-providers-media-verification.md) |
| Place card: price range and crowding estimate with source | [M5](M5-assistant-insights.md) |
| Place card buttons: directions / save / message | [M2](M2-routing-navigation-satellite.md) / [M6](M6-discover-activity-moderation.md) / [M4](M4-messaging-inbox-notifications.md) |
| Car and walking routes with preview, distance and ETA | [M2](M2-routing-navigation-satellite.md) |
| On-screen turn-by-turn navigation with Arabic text and reroute on deviation | [M2](M2-routing-navigation-satellite.md) |
| Sentinel-2 satellite layer with low-resolution disclaimer | [M2](M2-routing-navigation-satellite.md) |
| Assistant: Arabic text chat opened from a map button | [M5](M5-assistant-insights.md) |
| Assistant: trip-goal understanding with one clarifying question | [M5](M5-assistant-insights.md) |
| Assistant: 3–7 real places as cards and on the map | [M5](M5-assistant-insights.md) |
| Assistant: price/crowding only when available with source, otherwise 'no data' | [M5](M5-assistant-insights.md) |
| Assistant: plan a day (3–5 places with a route) | [M5](M5-assistant-insights.md) |
| Assistant: suggestion → messaging request with user confirmation before sending | [M5](M5-assistant-insights.md) (draft + confirm), [M4](M4-messaging-inbox-notifications.md) (send path) |
| Assistant: daily usage limits per user | [M5](M5-assistant-insights.md) |
| Messaging: one request to up to 5 places | [M4](M4-messaging-inbox-notifications.md) |
| Messaging: in-app channel for registered providers (primary) | [M4](M4-messaging-inbox-notifications.md) |
| Messaging: WhatsApp Cloud API with approved template, opted-in providers only | [M4](M4-messaging-inbox-notifications.md) |
| Messaging: manual handoff (WhatsApp/Instagram/call) with text copied to clipboard | [M4](M4-messaging-inbox-notifications.md) |
| Messaging: per-message status and replies in the app | [M4](M4-messaging-inbox-notifications.md) |
| Providers: provider mode inside the same app | [M3](M3-providers-media-verification.md) |
| Providers: mandatory phone OTP, name, category, location or claim of an OSM place | [M0](M0-walking-skeleton-login-gates.md) (PhoneVerificationPort), [M3](M3-providers-media-verification.md) |
| Providers: photos, price ranges, opening hours, social links | [M3](M3-providers-media-verification.md) (entry), [M5](M5-assistant-insights.md) (price display) |
| Providers: per-scope consent screen (photos, links, WhatsApp, phone display, prices) with revocation | [M3](M3-providers-media-verification.md) |
| Providers: inbox and replies | [M4](M4-messaging-inbox-notifications.md) |
| Providers: manual verification from the admin panel | [M3](M3-providers-media-verification.md) |
| Discover: city photo feed from verified providers and users | [M6](M6-discover-activity-moderation.md) |
| Discover: like, single-level comment, share link, report | [M6](M6-discover-activity-moderation.md) |
| Discover: tapping a post opens the place card on the map | [M6](M6-discover-activity-moderation.md) |
| Activity: saved places | [M6](M6-discover-activity-moderation.md) |
| Activity: recent routes | [M2](M2-routing-navigation-satellite.md) (recorded on device), [M6](M6-discover-activity-moderation.md) (shown in Activity) |
| Activity: my requests and messages | [M4](M4-messaging-inbox-notifications.md) (Messages tab), [M6](M6-discover-activity-moderation.md) (Activity section) |
| Activity: my posts | [M6](M6-discover-activity-moderation.md) |
| Account: phone login, name, language | [M0](M0-walking-skeleton-login-gates.md) |
| Account: notification settings (and push sending) | [M4](M4-messaging-inbox-notifications.md) |
| Account: switch to provider mode | [M3](M3-providers-media-verification.md) |
| Account: privacy screen | [M7](M7-ops-privacy-budgets-rc.md) |
| Account: delete account (Google Play requirement) | [M0](M0-walking-skeleton-login-gates.md) (identity + UserDataEraser), [M3](M3-providers-media-verification.md)–[M6](M6-discover-activity-moderation.md) (per-module erasers), [M7](M7-ops-privacy-budgets-rc.md) (cross-module e2e) |
| Admin web panel: provider verification | [M3](M3-providers-media-verification.md) |
| Admin web panel: reports and hiding content | [M6](M6-discover-activity-moderation.md) |
| Ops: error monitoring | [M7](M7-ops-privacy-budgets-rc.md) |
| Ops: logs without personal data | [M0](M0-walking-skeleton-login-gates.md) (redacting logger), [M7](M7-ops-privacy-budgets-rc.md) (scanner over all e2e) |
| Ops: assistant cost tracking | [M5](M5-assistant-insights.md) (per turn), [M7](M7-ops-privacy-budgets-rc.md) (admin page) |
| Arabic privacy policy and terms of use | [M7](M7-ops-privacy-budgets-rc.md) |
| NFR: Android 8+ on 3GB devices | [M0](M0-walking-skeleton-login-gates.md) (minSdk 26), [M7](M7-ops-privacy-budgets-rc.md) (API 26 emulator + 3GB profile) |
| NFR: APK/AAB under 40MB, maps loaded on demand | [M0](M0-walking-skeleton-login-gates.md) onward (enforced in android.yml) |
| NFR: first screen within 3s | [M7](M7-ops-privacy-budgets-rc.md) |
| NFR: search p95 < 800ms, route p95 < 1.5s | [M1](M1-map-search-place-card.md) / [M2](M2-routing-navigation-satellite.md) (measured on real data), [M7](M7-ops-privacy-budgets-rc.md) (blocking) |
| NFR: full RTL, clear Arabic font, touch sizes, AA contrast | [M0](M0-walking-skeleton-login-gates.md) onward (arabic-rtl-a11y auditor every milestone), [M7](M7-ops-privacy-budgets-rc.md) final sweep |
| NFR: messages and requests survive network loss (local queue + retry) | [M4](M4-messaging-inbox-notifications.md) |

## جاهزية M0

**جاهز الآن**

- الوثائق الملزمة مقروءة، والفرع `claude/iraq-smart-maps-app-aybpjn` فيه وثائق فقط، بلا كود تطبيق.
- الأدوات متحقق منها: Node 22، و pnpm 10، و Java 21، و Gradle 8.14، و Maven، و Python 3.13، و Go (`/usr/local/go/bin/go`)، و osmium، و redis-server، و psql 16.15.
- PostgreSQL 16 مع postgis 3.4.2 مثبّت؛ يُشغَّل بـ `pg_ctlcluster 16 main start`.
- الشبكة (2026-10-08): registry.npmjs.org (expo 57.0.27، و `@maplibre/maplibre-react-native` 11.5.0 الذي يتطلب expo>=54 و react-native>=0.80 و react>=19.1، و react-native 0.87.1، و `@nestjs/core` 12.1.2)، و Maven Central (planetiler-core)، و PyPI (pyvalhalla 3.9.1)، و proxy.golang.org (gitleaks)، و bucket ‏sentinel-cogs.
- `git ls-remote` يعمل، وأدوات GitHub MCP تقرأ تشغيلات CI وسجلاتها (رمز gh CLI غير صالح).
- M0 لا يحتاج أي سر.
- تعارض الإصدارات محلول: ts-rest 3.52.1 يتطلب zod ^3، فيُثبَّت zod 3.25.76.

**العوائق ومعالجتها**

- Android SDK غير قابل للتثبيت محلياً (dl.google.com محجوب): البوابة في `android.yml` فقط ([ADR-0009](../adr/0009-android-build-in-github-actions.md)).
- صلاحية دفع `.github/workflows/*` وتفعيل Actions بصلاحيات read and write غير مؤكدتين بعد: تجربة الدفع في بداية التجميد تحسم ذلك، وإن رُفضت تتوقف M0 ويُبلَّغ المستخدم.
- لا بيانات OSM حقيقية محلياً (Geofabrik و Overpass محجوبان): أرقام أربيل وبغداد الحقيقية من job الجودة في `geo-data.yml` فقط، والعمل المحلي على fixtures يدوية.
- Docker غير متاح محلياً، فلا Testcontainers ولا MinIO: PostGIS و Redis محلياً، وحاويات خدمة في CI ([ADR-0004](../adr/0004-local-postgis-instead-of-testcontainers.md)).
- الدخول على هاتف حقيقي يحتاج خادماً يصل إليه الهاتف: الدخول يُثبت على محاكي CI، وعلى الهاتف تعمل التبويبات وتبديل اللغة.

**البدائل المؤقتة في M0** (التفاصيل في [`MOCKS.md`](MOCKS.md))

- مرسلات OTP: ‏fake في الاختبارات، و fixed في e2e، و console في التطوير.
- رابط API عام: المحاكي مع خادم داخل الـ job، وشاشة «إعدادات المطوّر» لعنوان الخادم.
- بيانات Geofabrik: في CI فقط، و fixtures محلياً.
- Android SDK: `pnpm android:precheck` محلياً، والبناء الحقيقي في Actions.

**إعدادات افتراضية مطبَّقة** (كانت قرارات مفتوحة، وحُسمت بالتنفيذ المستقل): البحث في MVP عبر PostGIS + pg_trgm بدل Photon (ADR-0005، في M1)؛ وسوم الهاتف والموقع من OSM تظهر في بطاقات الأماكن غير المطالَب بها بشارة «من OpenStreetMap»، وتُستخدم للتسليم اليدوي في M4 فقط.
