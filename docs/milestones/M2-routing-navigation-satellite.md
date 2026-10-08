---
id: M2
slug: routing-navigation-satellite
status: not_started
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-routing:
    - "geo-services/routing/**"
    - "modules/routing/**"
    - ".github/workflows/geo-data.yml"
  builder-imagery:
    - "geo-services/imagery/**"
    - ".github/workflows/imagery.yml"
    - "docs/DATA_SOURCES.md"
  builder-navigation-app:
    - "mobile-features/navigation/**"
  builder-map-kit-m2:
    - "packages/map-kit/**"
    - "packages/geo/**"
    - "packages/mobile-kit/**"
  builder-map-app-m2:
    - "mobile-features/map/**"
    - "modules/places/**"
  builder-e2e-m2:
    - "e2e/**"
    - "tools/bench/**"
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
  auditor-architecture-m2: architecture-contracts
  auditor-qa-m2: qa-build
  auditor-licensing-m2: licensing-data
  auditor-rtl-m2: arabic-rtl-a11y
---

# M2 — الاتجاهات والملاحة خطوة بخطوة وطبقة الأقمار الصناعية

**الحالة:** لم تبدأ · **التقدير:** 3–4 ساعة · **يعتمد على:** [M1](M1-map-search-place-card.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

يضغط المستخدم «اتجاهات» في بطاقة المكان فيرى معاينة مسار بالسيارة أو مشياً، مع المسافة والوقت المتوقع.

عند بدء الملاحة:
- تظهر تعليمات نصية خطوة بخطوة بالعربية أو الكردية أو الإنجليزية حسب لغته.
- عند الانحراف عن المسار يُعاد حسابه تلقائياً مرة واحدة لكل انحراف، حتى الوصول.
- يُحفظ المسار في «آخر المسارات» على الجهاز.

ويستطيع تشغيل طبقة أقمار Sentinel-2 مع:
- تنبيه دائم بأنها منظر عام بدقة 10م.
- إسناد Copernicus، مع بقاء إسناد OSM ظاهراً.

## الميزات المطلوبة

- [ ] **Valhalla بلا Docker**
  - إعداد Valhalla، وبناء البلاطات بـ valhalla_build_tiles من wheel ‏pyvalhalla 3.9.1 على PyPI.
  - تشغيل valhalla_service محلياً على fixture شبكة طرق يدوية.
  - job في geo-data.yml يبني بلاطات المدينة الحقيقية، ويرفعها كـ artifact، ويقيس p95 للمسار.
- [ ] **وحدة routing**
  - RoutingEngine: عميل HTTP لـ Valhalla بمهلة.
  - تنفيذ RoutingPort: سيارة ومشي، ونقاط وسيطة حتى 5.
  - تعيد مناورات منظّمة (النوع، الاتجاه، أسماء الشوارع، المسافة، الزمن) بدل نص Valhalla، لأن سرده العربي ناقص والكردية غير موجودة (ADR-0006).
  - تحقق zod، وحد معدّل.
- [ ] **ميزة الملاحة**
  حزمة feature-navigation:
  - المعاينة، واختيار الوسيلة، والمسافة والزمن بأرقام حسب اللغة.
  - بدء الملاحة، وشريط التعليمة الحالية والتالية من قوالب i18n بثلاث لغات.
  - تتبع الموقع.
  - كشف الانحراف: أكثر من 40م في 3 قراءات متتالية، ثم طلب مسار جديد مرة واحدة.
  - كشف الوصول، وإبقاء الشاشة مضاءة.
  - حفظ المسار في السجل المحلي.
  - المنطق في محرك TypeScript نقي، يُختبر بمسارات GPS مسجّلة.
- [ ] **أدوات الهندسة والخريطة**
  - packages/geo: فك polyline6، والمسافة إلى الخط، وأقرب نقطة، والاتجاه.
  - map-kit: خط المسار، وتتبع الكاميرا للمستخدم، وطبقة raster للأقمار مع إسنادها ومكوّن التنبيه.
  - mobile-kit: مخزن recentRoutes محلي.
- [ ] **طبقة الأقمار الصناعية**
  - pipeline (عبر imagery.yml):
    - يسرد ملفات Sentinel-2 L2A (TCI) مباشرة من bucket ‏sentinel-cogs العام حسب مربع MGRS، لأن Earth Search STAC محجوب.
    - يختار المشهد الأقل غيوماً، ويقص حدود المدينة.
    - يحوّلها إلى raster PMTiles (z10–14) ويرفعها كـ artifact.
  - واصف الطبقة في ‎/v1/cities: الرابط، والإسناد، والدقة، وتاريخ الالتقاط.
  - في الخريطة: مفتاح الطبقة مع التنبيه، وزر «اتجاهات» في البطاقة.

## خارج النطاق

- الإرشاد الصوتي، والنقل العام، والزحمة الحية.
- الملاحة في الخلفية والملاحة offline.
- صور أقمار عالية الدقة.

## العقود

يجمّدها المكامل في commit `chore(M2): freeze contracts` قبل أن يبدأ أي بنّاء (القواعد في [سياسة العقود](README.md#سياسة-العقود)). المحتوى المطلوب:

The integrator freezes contracts in 30 min or less. It adds:
- routing router: POST /v1/routes {origin, destination, waypoints (5 or fewer), mode car|walk} returning RouteResult {polyline6, distanceM, durationS, bbox, maneuvers[{type, modifier?, streetNames[], distanceM, durationS, beginShapeIndex}]}
- a closed ManeuverType enum (ADR-0006)
- RoutingPort and RoutingEngine, with FakeRoutingPort and a conformance suite
- CityDescriptor.satellite? {url, attribution, resolutionM, capturedAt}
- typed stubs: geo (decodePolyline6, distanceToPolylineM, nearestPointOnLine, bearing); map-kit (RouteLine, followUser, baseLayer 'vector'|'satellite'); mobile-kit recentRoutes
- route links navigation/preview and navigation/active with params
- testIDs
- the VALHALLA_URL and IMAGERY_URL names in .env.example
- ownership front-matter

## توزيع الوكلاء

### البنّاؤون

يعملون بالتوازي كوكلاء في الخلفية، كلٌّ داخل مساراته فقط (انظر [البناء المتوازي](README.md#دورة-حياة-المرحلة)).

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-routing` | `geo-services/routing/**`<br>`modules/routing/**`<br>`.github/workflows/geo-data.yml` | • إعداد Valhalla، وسكربت بناء البلاطات وتشغيل الخدمة عبر pyvalhalla.<br>• fixture شبكة طرق: حلقة، وشارع باتجاه واحد، وممر مشاة.<br>• job بلاطات المدينة وقياس p95 في geo-data.yml.<br>• وحدة routing: العميل، والتحويل إلى مناورات منظّمة، وحد المعدّل.<br>• اختبارات باستجابات مسجّلة وتكامل حي محلي. |
| `builder-imagery` | `geo-services/imagery/**`<br>`.github/workflows/imagery.yml`<br>`docs/DATA_SOURCES.md` | • pipeline الأقمار من sentinel-cogs إلى raster PMTiles، مع اختبار اصطناعي.<br>• imagery.yml مع رفعها كـ artifacts.<br>• تسجيل المصدر والترخيص ونص الإسناد. |
| `builder-navigation-app` | `mobile-features/navigation/**` | حزمة feature-navigation:<br>• المعاينة والملاحة.<br>• قوالب التعليمات بثلاث لغات.<br>• محرك الانحراف وإعادة التوجيه، والوصول.<br>• تسجيل المسار محلياً.<br>• اختبارات بمسارات GPS مسجّلة، وتدفقا Maestro. |
| `builder-map-kit-m2` | `packages/map-kit/**`<br>`packages/geo/**`<br>`packages/mobile-kit/**` | • خط المسار، وتتبع الكاميرا، وطبقة raster للأقمار مع الإسناد ومكوّن التنبيه.<br>• دوال الهندسة مع اختبارات الدقة.<br>• مخزن recentRoutes. |
| `builder-map-app-m2` | `mobile-features/map/**`<br>`modules/places/**` | • واصف طبقة الأقمار في ‎/v1/cities.<br>• مفتاح الطبقة مع التنبيه في الخريطة.<br>• زر «اتجاهات» في البطاقة. |
| `builder-e2e-m2` | `e2e/**`<br>`tools/bench/**` | • سيناريوهات e2e/api للمسارات.<br>• تشغيل valhalla_service على fixture داخل الـ harness.<br>• أمر route في tools/bench. |

### المكامل (integrator)

**يملك:** `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `turbo.json`، `.gitignore`، `.env.example`، `.gitleaks.toml`، `packages/tooling/**`، `packages/contracts/**`، `packages/testing/**`، `tools/ownership/**`، `apps/api/**`، `apps/mobile/*`، `apps/mobile/app/**`، `apps/mobile/src/shell/**`، `.github/workflows/ci.yml`، `.github/workflows/android.yml`، `docs/milestones/**`، `docs/adr/**`، `CLAUDE.md`

- ربط routing و RoutingPort في apps/api.
- إعداد Python وذاكرة pip المؤقتة في android.yml للـ harness.
- مسارات شاشات الملاحة، و plugin لإبقاء الشاشة مضاءة.
- كتابة ADR-0006.

### المدققون

لم يكتب أيٌّ منهم كود هذه المرحلة، ولا يعدّلون الكود؛ يرفعون الملاحظات لمالك الملف.

| الوكيل | العدسة | يفحص |
|---|---|---|
| `auditor-architecture-m2` | `architecture-contracts` | • منطق الهندسة في packages/geo فقط، بلا تكرار داخل الميزة.<br>• أنواع Valhalla لا تتسرب إلى العقود.<br>• النص يُولَّد في العميل فقط.<br>• الميزات لا تستورد بعضها.<br>• نجاح knip و jscpd، والملكية سليمة. |
| `auditor-qa-m2` | `qa-build` | • تشغيل Valhalla الحقيقي محلياً.<br>• واقعية آثار الانحراف.<br>• رقم p95 من CI.<br>• نجاح كل تدفقات المحاكي السابقة والحالية لنفس الـ SHA. |
| `auditor-licensing-m2` | `licensing-data` | • ترخيص Sentinel-2 من AWS Open Data، ونص الإسناد مع السنة.<br>• عدم استخدام EOX غير التجاري أو Esri أو Google أو Bing أو Mapbox.<br>• تسجيل Valhalla و pyvalhalla. |
| `auditor-rtl-m2` | `arabic-rtl-a11y` | • صياغة التعليمات بالعربية والكردية.<br>• اتجاه الأسهم في RTL.<br>• حجم شريط التعليمة وتباينه أثناء القيادة.<br>• قراءة تنبيه دقة الأقمار بقارئ الشاشة. |

## معايير القبول

| # | المعيار | طريقة التحقق |
|---|---|---|
| 1 | بلاطات Valhalla تُبنى من الـ fixture والخدمة تعمل محلياً | `pnpm --filter @iraq-maps/geo-routing test`: valhalla_build_tiles runs on the fixture pbf, valhalla_service starts on a random port, and /status responds |
| 2 | المسار بالسيارة والمشي صحيح عبر Valhalla حقيقي | `pnpm --filter @iraq-maps/routing test`:<br>• mapping of recorded responses to RouteResult<br>• live-local integration on the fixture: car avoids the footway, walk uses it<br>• the RoutingPort conformance suite passes for the real adapter and for FakeRoutingPort |
| 3 | واجهة المسارات تتحقق من المدخلات وتحد المعدّل | `pnpm --filter @iraq-maps/e2e-api test -- routing`:<br>• car and walk return polyline6, distance, duration and maneuvers with street names<br>• invalid input returns 400 Problem<br>• a burst of requests returns 429 |
| 4 | أدوات الهندسة دقيقة | `pnpm --filter @iraq-maps/geo test`: polyline6 decode matches a Valhalla sample; distanceToPolylineM is within 1m of reference values |
| 5 | الملاحة تعطي تعليمات بثلاث لغات وتعيد التوجيه مرة واحدة عند الانحراف | `pnpm --filter @iraq-maps/feature-navigation test`:<br>• a table test covers every ManeuverType in ar, ckb and en<br>• a noisy on-route trace never reroutes<br>• deviation over 40m on 3 consecutive fixes triggers exactly one reroute<br>• arrival is detected<br>• a recentRoutes entry is written |
| 6 | زمن المسار على بيانات المدينة الحقيقية ضمن الميزانية | The geo-data.yml routing job on a GitHub runner concludes success: the run's artifact holds the city's Valhalla tiles, and 200 routes give server-side p95 under 1.5s, recorded in the summary and the milestone file |
| 7 | طبقة الأقمار تُبنى وتظهر مع التنبيه والإسنادين | `pnpm --filter @iraq-maps/geo-imagery test`: a synthetic GeoTIFF becomes raster PMTiles with the expected bounds and zoom range.<br>The imagery.yml run concludes success, and the real scene's capture date is recorded.<br>`pnpm --filter @iraq-maps/feature-map test`: the toggle shows the 10m disclaimer and the Copernicus attribution, and the OSM attribution remains visible. |
| 8 | مصدر الأقمار مسجّل بترخيص تجاري ونص إسناد | docs/DATA_SOURCES.md contains the Sentinel-2 L2A COGs (AWS Open Data) entry with license, attribution text and verification date; auditor-licensing-m2 APPROVED |
| 9 | المعاينة والملاحة وإعادة التوجيه تعمل على محاكي أندرويد | android.yml e2e job green. It runs the M0 and M1 flows plus:<br>• mobile-features/navigation/maestro/preview-and-start.yaml: card, اتجاهات, the preview shows the distance, start, the first Arabic instruction is visible<br>• mobile-features/navigation/maestro/reroute.yaml: a setLocation off-route sequence shows the reroute banner and then a new instruction<br>The in-runner harness serves valhalla_service on fixture tiles. |
| 10 | بوابة الجودة و CI وبناء أندرويد خضراء وموافقة المدققين | `pnpm gate` exits 0; ci.yml and the android.yml build job are green for the head SHA with an APK of 40MB or less; the audit log shows every auditor APPROVED |

## المتطلبات البيئية والبدائل المؤقتة

- The pyvalhalla 3.9.1 manylinux x86_64 wheel is on PyPI (downloaded today). Drafts confirmed it contains valhalla_build_tiles and valhalla_service, and that routing works on a fixture. Fallback if the binaries fail in the container: recorded responses locally and real Valhalla only in CI, documented as a deviation.
- The sentinel-cogs S3 bucket is reachable from the container (200) and from runners. Earth Search STAC is blocked, so the pipeline lists S3 prefixes directly.
- rasterio wheels from PyPI, plus rio-pmtiles from pip or go-pmtiles via go install.
- Real city Valhalla tiles are built only on a GitHub runner (Geofabrik is blocked locally).

**البدائل المؤقتة (mocks) في هذه المرحلة:** رابط API عام للتجربة على هاتف حقيقي، بيانات Geofabrik (في CI فقط)، Valhalla (التوجيه)، Android SDK محلياً. التفاصيل وما يلزم للتشغيل الحقيقي في [MOCKS.md](MOCKS.md).

## بوابة الإغلاق

كل البنود على **نفس الـ SHA** (التفاصيل في [بوابة الإغلاق](README.md#بوابة-الإغلاق)):

- [ ] `pnpm infra:local up && pnpm install --frozen-lockfile && pnpm gate` ينجح من نسخة نظيفة
- [ ] `pnpm android:precheck` ينجح
- [ ] `ci.yml` ناجح
- [ ] `android.yml`: job ‏build ناجح (APK ‏arm64 ≤ 40MB ومرفوع كـ artifact)، و job ‏e2e ناجح (تدفقات Maestro لهذه المرحلة وكل ما قبلها)
- [ ] `geo-data.yml` و `imagery.yml` ناجح
- [ ] كل معايير القبول أعلاه مُثبتة بدليلها في «ما تم إنجازه»
- [ ] كل المدققين (4) سجّلوا `APPROVED <sha>` بلا ملاحظات حاجبة مفتوحة
- [ ] commit و push إلى `claude/iraq-smart-maps-app-aybpjn`، وتسجيل الـ SHA في الجدول أدناه، وتحديث الفهرس

## المخاطر

- ملفات pyvalhalla قد تحتاج مكتبات نظام غير موجودة. البديل استجابات مسجّلة محلياً، و Valhalla الحقيقي في CI.
- ضجيج GPS في المدينة قد يسبب إعادة توجيه زائفة. العتبات قابلة للضبط ومختبرة بآثار مسجّلة.
- محاكاة الموقع على المحاكي غير مستقرة. منطق الانحراف مثبت بـ Jest، و Maestro يتحقق من الواجهة فقط.
- دقة 10م قد تخيّب توقعات المستخدم. نعالج ذلك بتنبيه دائم وطبقة اختيارية.
- الغيوم وتغيّر المواسم تؤثر على المشهد. نختار الأقل غيوماً تلقائياً، ونوثّق تاريخ الالتقاط.

## ما تم إنجازه

لم تبدأ بعد.

| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| | | | |
