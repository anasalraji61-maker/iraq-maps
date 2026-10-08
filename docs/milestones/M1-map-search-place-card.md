---
id: M1
slug: map-search-place-card
status: in_progress
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-geo-data:
    - "geo-services/pipeline/**"
    - ".github/workflows/geo-data.yml"
    - "docs/DATA_SOURCES.md"
    - "docs/reports/**"
    - "docs/contract-requests/M1-builder-geo-data.md"
  builder-tiles:
    - "geo-services/tiles/**"
    - "docs/contract-requests/M1-builder-tiles.md"
  builder-places:
    - "modules/places/**"
    - "docs/contract-requests/M1-builder-places.md"
  builder-map-kit:
    - "packages/map-kit/**"
    - "packages/geo/**"
    - "docs/contract-requests/M1-builder-map-kit.md"
  builder-map-app:
    - "mobile-features/map/**"
    - "packages/ui/**"
    - "docs/contract-requests/M1-builder-map-app.md"
  builder-e2e-m1:
    - "e2e/**"
    - "tools/bench/**"
    - "docs/contract-requests/M1-builder-e2e-m1.md"
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
    - "packages/mobile-kit/**"
    - "packages/api-client/**"
    - "packages/db-kit/**"
    - "infra/README.md"
    - "mobile-features/account/**"
    - "modules/identity/**"
    - ".github/workflows/ci.yml"
    - ".github/workflows/android.yml"
    - "docs/milestones/**"
    - "docs/adr/**"
    - "CLAUDE.md"
auditors:
  auditor-architecture-m1: architecture-contracts
  auditor-qa-m1: qa-build
  auditor-licensing-m1: licensing-data
  auditor-rtl-m1: arabic-rtl-a11y
  auditor-security-m1: security-privacy
---

# M1 — خريطة المدينة والبحث العربي وبطاقة المكان

**الحالة:** قيد التنفيذ · **التقدير:** 3–4 ساعة · **يعتمد على:** [M0](M0-walking-skeleton-login-gates.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

يفتح المستخدم تبويب الخريطة فيرى خريطة vector لبغداد (المدينة الأولى حسب ADR-0002). الأسماء تظهر بالعربية، ثم بالكردية إن غابت العربية، ثم بالاسم الأصلي، ويستطيع تغيير لغة الخريطة. إسناد OpenStreetMap ظاهر دائماً.

يستطيع المستخدم:
- التمركز على موقعه بزر «موقعي».
- البحث بالعربية بأي إملاء عن أماكن وشوارع وأحياء، مرتبة حسب التشابه والقرب.
- فتح بطاقة مكان فيها: الاسم، والفئة، والحي، وساعات العمل مع «مفتوح الآن»، وبيانات OSM العامة بشارة مصدرها، وزر مشاركة برابط iraqmaps://place/<id>.

الأزرار التي لم تُسلَّم ميزاتها بعد لا تظهر.

بيانات المدينة الحقيقية تُبنى في CI وتُرفع كـ artifacts من geo-data.yml، وكل شيء يعمل محلياً على بيانات fixture.

## الميزات المطلوبة

- [ ] **pipeline المدينة**
  - قص المستخرج بـ osmium حسب ملف المدينة.
  - استخراج الأماكن والشوارع والأحياء إلى NDJSON وفق PlaceImportRecord، بالأسماء الأربعة والوسوم المفيدة (opening_hours و phone و website).
  - fixture يدوي baghdad-mini.osm بترخيص CC0، مسجّل في DATA_SOURCES.
  - job في geo-data.yml يبني بيانات المدينة الحقيقية: ‏PMTiles و glyphs و NDJSON كـ artifact باسم data-<city>-<date>، ثم يقيس p95 للبحث على PostGIS داخل CI.
- [ ] **بلاطات vector و glyphs عربية**
  - مشروع Maven يعتمد planetiler-core من Maven Central، بملف profile واحد مخصص لـ OSM فقط ومطابق لـ TileSchema.
  - الطبقات: transportation و place و poi و building و water و landuse و boundary، مع name و name:ar و name:ckb و name:en.
  - لا حاجة لـ Natural Earth أو مضلّعات المحيطات، لأن المدينة داخلية.
  - glyphs بنطاقات العربية واللاتينية من خط Noto المسجّل.
- [ ] **map-kit و geo**
  - MapCanvas يغلّف MapLibre Native.
  - ستايل لكل لغة من قالب واحد: coalesce(name:<lang>، name:ar، name:ckb، name).
  - مصدر pmtiles:// أو XYZ حسب واصف المدينة.
  - نقطة الموقع، وإسناد لا يمكن إخفاؤه، وطبقة علامات النتائج، و mock جاهز لـ Jest.
  - packages/geo: ‏bbox، والمسافات، وحدود الكاميرا.
- [ ] **وحدة places والبحث العربي**
  - استيراد NDJSON إلى جداول OSM في schema ‏places، بشكل idempotent.
  - بحث pg_trgm على الأسماء المطبّعة بثلاث لغات، مع ترتيب يجمع التشابه والقرب والنوع.
  - المسارات: ‎/v1/search و ‎/v1/places/:id و ‎/v1/places/nearby و ‎/v1/cities.
  - مسارا احتياط لتقديم البلاطات والـ glyphs من ملف محلي أو رابط يحدده واصف المدينة، عبر مكتبة pmtiles.
  - تنفيذ PlacesQueryPort.
  - Photon مؤجل حسب ADR-0005.
- [ ] **ميزة الخريطة في التطبيق**
  حزمة feature-map:
  - شريط بحث بتأخير (debounce) مع إلغاء الطلب السابق.
  - النتائج مع المسافة، وحالات: بلا نتائج، بلا شبكة، تحميل.
  - البطاقة مع «مفتوح الآن» وشارة المصدر.
  - مشاركة الرابط.
  - زر «موقعي» مع طلب الإذن والتعامل مع رفضه.
  - تبديل لغة أسماء الخريطة.
  - الإجراءات المستقبلية تبقى مخفية عبر useRouteAvailable.
- [ ] **اختبار البحث على المحاكي**
  - الـ harness يحمّل fixture الأماكن ويقدّم بلاطات fixture عبر مسار الاحتياط في الخادم.
  - Maestro: البحث عن «قلعه»، ثم الضغط على النتيجة، ثم ظهور البطاقة.

## خارج النطاق

- المسارات والملاحة والأقمار (M2).
- بيانات المزوّد على البطاقة (M3)، والأسعار والزحمة (M5).
- أزرار الحفظ والمراسلة والمساعد (تظهر آلياً عند تسليمها).
- Photon (مؤجل بـ ADR-0005)، والخرائط offline.

## العقود

يجمّدها المكامل في commit `chore(M1): freeze contracts` قبل أن يبدأ أي بنّاء (القواعد في [سياسة العقود](README.md#سياسة-العقود)). المحتوى المطلوب:

The integrator freezes contracts in 30 min or less. It adds:
- cities router: GET /v1/cities returning CityDescriptor {id, names{ar,ckb,en}, bbox, center, tilesUrl, glyphsUrl, attribution}, plus the fallback routes GET /v1/cities/:id/tiles/:z/:x/:y and GET /v1/cities/:id/glyphs/:fontstack/:range
- places router: GET /v1/search?q&city&near&lang&limit returning SearchResult with kind place|street|area; GET /v1/places/:id returning PlaceDetails {id, names, category, area, hoursRaw, osmContacts{phone?, website?}, source:'osm', attribution}; GET /v1/places/nearby
- the PlaceCategory enum
- PlacesQueryPort, with FakePlacesQueryPort and a conformance suite
- TileSchema constants
- PlaceImportRecord
- CLI contracts for geo-services tiles build --input --output --bbox, for the pipeline extract, and for the bench CLI
- typed stubs: map-kit (MapCanvas props, markers, camera), geo, ui PlaceSummaryCard
- route links: map, place/:id
- testIDs
- ownership front-matter

No event is added, because nothing consumes one yet.

## توزيع الوكلاء

### البنّاؤون

يعملون بالتوازي كوكلاء في الخلفية، كلٌّ داخل مساراته فقط (انظر [البناء المتوازي](README.md#دورة-حياة-المرحلة)).

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-geo-data` | `geo-services/pipeline/**`<br>`.github/workflows/geo-data.yml`<br>`docs/DATA_SOURCES.md` | • القص والاستخراج إلى NDJSON.<br>• fixture ‏baghdad-mini.osm.<br>• jobs المدينة والأداء في geo-data.yml مع رفعها كـ artifacts.<br>• تسجيل fixture والمصادر في DATA_SOURCES. |
| `builder-tiles` | `geo-services/tiles/**` | • profile ‏Planetiler مطابق لـ TileSchema.<br>• CLI موحّد للبناء.<br>• توليد glyphs عربية ولاتينية، والأداة تُختار وتُسجَّل عند التجميد.<br>• اختبار بناء الـ fixture وفك بلاطة منه. |
| `builder-places` | `modules/places/**` | وحدة places مع اختباراتها على PostGIS المحلي:<br>• الاستيراد idempotent.<br>• فهارس GIN و GiST على الأعمدة المطبّعة.<br>• البحث المرتب، والتفاصيل، والقريب، وسجل المدن.<br>• مسارا احتياط البلاطات والـ glyphs.<br>• اجتياز conformance suite. |
| `builder-map-kit` | `packages/map-kit/**`<br>`packages/geo/**` | • MapCanvas، والستايل لكل لغة من قالب واحد، ومصدر PMTiles أو XYZ.<br>• الموقع والإسناد والعلامات، و mock لـ Jest.<br>• دوال geo الأساسية. |
| `builder-map-app` | `mobile-features/map/**`<br>`packages/ui/**` | • feature-map: شاشة الخريطة، والبحث، والبطاقة، و«موقعي»، وتبديل لغة الخريطة، ونصوص مساحة الأسماء map، واختبارات RNTL، وتدفق Maestro.<br>• PlaceSummaryCard المشترك في packages/ui. |
| `builder-e2e-m1` | `e2e/**`<br>`tools/bench/**` | • سيناريوهات e2e/api للمدن والبحث والبطاقة.<br>• توسيع الـ harness لتحميل fixture الأماكن والبلاطات.<br>• أداة tools/bench لقياس p95. |

### المكامل (integrator)

**يملك:** `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `turbo.json`، `.gitignore`، `.env.example`، `.gitleaks.toml`، `packages/tooling/**`، `packages/contracts/**`، `packages/testing/**`، `tools/ownership/**`، `apps/api/**`، `apps/mobile/*`، `apps/mobile/app/**`، `apps/mobile/src/shell/**`، `.github/workflows/ci.yml`، `.github/workflows/android.yml`، `docs/milestones/**`، `docs/adr/**`، `CLAUDE.md`

- ربط places و PlacesQueryPort في apps/api.
- app.config: ‏plugin ‏MapLibre، وأذونات الموقع.
- مسار تبويب الخريطة، ورابط iraqmaps://place/:id.
- إضافة متغيرات TILES_SOURCE و GLYPHS_SOURCE إلى .env.example.
- كتابة ADR-0005 (البحث في PostGIS وتأجيل Photon)، و ADR-0008 (البلاطات واستضافة بيانات التطوير كـ Actions artifacts).

### المدققون

لم يكتب أيٌّ منهم كود هذه المرحلة، ولا يعدّلون الكود؛ يرفعون الملاحظات لمالك الملف.

| الوكيل | العدسة | يفحص |
|---|---|---|
| `auditor-architecture-m1` | `architecture-contracts` | • البلاطات والستايل مشتقان من TileSchema بلا تكرار.<br>• الميزات لا تستورد بعضها، و places لا تستورد وحدة أخرى.<br>• لا JOIN بين schemas.<br>• نجاح knip و jscpd، والملكية سليمة. |
| `auditor-qa-m1` | `qa-build` | • يشغّل البوابة ومعايير القبول.<br>• يتحقق من رقم p95 من تشغيل CI الحقيقي.<br>• يتحقق من اختبارات حالات الإملاء والقرب والفشل (شبكة، 404، 400).<br>• يتحقق من نجاح android.yml بجزأيه. |
| `auditor-licensing-m1` | `licensing-data` | • إسناد © OpenStreetMap contributors ظاهر دائماً.<br>• عدم استخدام tile.openstreetmap.org.<br>• تسجيل fixture (CC0) و Planetiler و glyphs.<br>• فصل جداول OSM.<br>• الـ artifact يحمل ملف الإسناد. |
| `auditor-rtl-m1` | `arabic-rtl-a11y` | • ترتيب لغة التسميات.<br>• تشكّل الحروف العربية في لقطة المحاكي.<br>• البطاقة والنتائج في RTL.<br>• الأرقام والمسافات حسب اللغة.<br>• تسميات قارئ الشاشة لأزرار الخريطة. |
| `auditor-security-m1` | `security-privacy` | • التحقق بـ zod وحدود الطول على البحث.<br>• حد المعدّل.<br>• غياب SQL injection في استعلامات trigram.<br>• عدم تسجيل الإحداثيات الدقيقة.<br>• مسارا الاحتياط لا يسمحان بقراءة ملفات خارج المصدر المحدد. |

## معايير القبول

| # | المعيار | طريقة التحقق |
|---|---|---|
| 1 | pipeline يستخرج من الـ fixture الأعداد والأسماء المتوقعة | `pnpm --filter @iraq-maps/geo-pipeline test` checks the exact counts of POIs, streets and areas, and validates every line against the PlaceImportRecord zod schema (via its JSON Schema export) |
| 2 | البلاطات و glyphs تُبنى من الـ fixture بالطبقات والحقول المتفق عليها | `pnpm --filter @iraq-maps/geo-tiles test`:<br>• Maven runs the profile on the fixture pbf<br>• the test reads the PMTiles header and decodes one MVT tile<br>• layers and fields equal the TileSchema in contracts<br>• the Arabic and Latin glyph ranges exist |
| 3 | الستايل يتبع ترتيب اللغة ويجتاز التحقق، والإسناد ظاهر دائماً | `pnpm --filter @iraq-maps/map-kit test`:<br>• the label expression order is correct for ar, ckb and en<br>• @maplibre/maplibre-gl-style-spec validate passes<br>• the attribution component always renders and cannot be hidden |
| 4 | البحث العربي يوحّد الإملاء ويعيد أماكن وشوارع وأحياء مرتبة بالقرب | `pnpm --filter @iraq-maps/e2e-api test -- places`:<br>• اربيل, أربيل and إربيل return the same top id<br>• قلعه and قلعة return the same top id<br>• street and area kinds are returned<br>• `near` reorders results by distance<br>• GET /v1/places/:id returns details; a missing id returns 404 Problem<br>• an invalid query returns 400<br>• GET /v1/cities returns the descriptor with tilesUrl and attribution<br>• the tiles fallback returns a valid MVT |
| 5 | المنفذ الحقيقي والمزيّف يجتازان نفس مجموعة الاختبار | `pnpm --filter @iraq-maps/places test` runs the PlacesQueryPort conformance suite from packages/testing against the PostGIS implementation; the fake passes the same suite |
| 6 | جداول OSM منفصلة وجاهزة لفصل بيانات المزوّد (ODbL) | places SQL test: the places.osm_* tables hold only OSM-derived columns; depcruise is green |
| 7 | ميزة الخريطة تعمل في اختبارات الواجهة | `pnpm --filter @iraq-maps/feature-map test` (RNTL):<br>• debounced search with cancellation<br>• results and their empty, offline and loading states<br>• the card with open-now and the source badge<br>• the share link<br>• locate-me with a mocked location, and with permission denied<br>• the attribution is visible<br>• actions without a route are hidden |
| 8 | بيانات المدينة الحقيقية تُبنى، والبحث عليها ضمن الميزانية | The geo-data.yml city and perf jobs on a GitHub runner conclude success:<br>• the artifact data-<city>-<date> holds the PMTiles, glyphs and NDJSON<br>• the data is imported into a CI PostGIS<br>• `pnpm --filter @iraq-maps/bench search` runs 200 queries with server-side p95 under 800ms<br>• the counts and p95 are written to the job summary and copied into the milestone file |
| 9 | بناء أندرويد ينجح والحجم ضمن الميزانية مع MapLibre | android.yml build job green for the head SHA; arm64 APK 40MB or less |
| 10 | البحث وفتح البطاقة يعملان على محاكي أندرويد | android.yml e2e job green: the M0 flows plus mobile-features/map/maestro/search-place.yaml (map-view and osm-attribution visible, type قلعه, tap the result, place-card shows the name, category and source). The screenshot artifact is reviewed by auditor-rtl-m1 for Arabic label shaping. |
| 11 | بوابة الجودة و CI خضراء وموافقة المدققين | `pnpm gate` exits 0; ci.yml is green for the head SHA; the audit log shows every auditor APPROVED |

## المتطلبات البيئية والبدائل المؤقتة

- Java 21 + Maven, with planetiler-core on Maven Central (reachable).
- osmium-tool is installed; pyosmium installs via pip.
- Noto Sans Arabic TTF from npm, for example @expo-google-fonts/noto-sans-arabic. The glyph tool is chosen at the freeze.
- Real city data is processed only in geo-data.yml on GitHub runners. Outputs are uploaded as workflow artifacts and inspected through GitHub MCP; no GitHub Releases are used.
- A KVM emulator on the GitHub runner.
- Default applied under autonomous execution: OSM phone and website tags are shown on unclaimed place cards with a 'From OpenStreetMap' label, and used only for manual handoff in M4.
- Optional: trying the real map and search on a phone needs a reachable API and hosted city data (see MOCKS.md). The gate does not depend on it.

**البدائل المؤقتة (mocks) في هذه المرحلة:** رابط API عام للتجربة على هاتف حقيقي، بيانات Geofabrik (في CI فقط)، Photon (geocoding)، نطاق لروابط المشاركة، Android SDK محلياً. التفاصيل وما يلزم للتشغيل الحقيقي في [MOCKS.md](MOCKS.md).

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

- دعم pmtiles:// عبر إعادة توجيه GitHub في MapLibre Native 13.6.1 غير مؤكد. البديل XYZ من الخادم جاهز في نفس المرحلة.
- تشكّل الحروف العربية بالـ glyphs في MapLibre Native قد يحتاج ضبطاً. نتحقق منه بلقطة المحاكي ومراجعة RTL.
- name:ar ناقص لأماكن كثيرة (27% فقط من أماكن بغداد عليها name:ar، و81% مسمّاة بالعربية في name). نعالج ذلك بفهرسة كل name:* والعرض الاحتياطي، والتقرير يقيس النقص.
- أداء pg_trgm على العربية. نستخدم فهارس GIN على أعمدة مطبّعة، ونقيس على بيانات حقيقية في نفس المرحلة.
- ملف profile ‏Planetiler بـ Java يجب أن يبقى صغيراً ومشتقاً من TileSchema.

## انحرافات مسجّلة

- تجميد عقود M1 تم بينما M0 في الإغلاق؛ المسارات المتداخلة (packages/ui و e2e و apps/mobile) مؤجلة لـ builder-map-app و builder-e2e-m1 إلى ما بعد إغلاق M0
- توزيع البنّائين: الجلسة B ← builder-tiles + builder-map-kit؛ الجلسة C ← builder-geo-data + builder-places؛ map-app و e2e-m1 بعد إغلاق M0
- **‏PlaceSummaryCard لم يُجمَّد كـ stub.** ‏`packages/ui` قيد الإغلاق في M0، فيعرّفه builder-map-app بعد الإغلاق، ويستهلك `PlaceSummary` و `PlaceDetails` من العقود.
- **‏Planetiler من jar التوزيع، لا planetiler-core من Maven Central.** ‏planetiler-core يحتاج GeoTools وقت التشغيل، و GeoTools غير موجود على Maven Central، ومستودعه repo.osgeo.org محجوب هنا. ‏`geo-services/tiles` يعتمد على `planetiler.jar` 0.10.2 من GitHub release، مثبّتاً بـ SHA-256 ([ADR-0008](../adr/0008-tiles-and-dev-data-as-actions-artifacts.md)).
- **إضافات على قائمة العقود.** تحتاجها geo-data.yml والاختبارات:
  - عقدا CLI ‏`glyphsBuild` و `placesImport`.
  - ‏`CityImportRecord` ‏(`city.json`) مع تصدير JSON Schema.
  - ‏`Glyphs` و `OSM_ATTRIBUTION` و `nameFallback`/`pickName`.
  - testIDs ‏`place.name` و `place.category` و `place.source` لمعيار القبول 10.
- **روابط المسارات موجودة.** ‏`map` و `place` معرّفان في `packages/mobile-kit/src/routes.tsx` منذ M0، فلا طلب عقد.
- **ملكية إضافية للمكامل في M1.** حزم M0 التالية بلا مالك في M1، فأخذها المكامل لتطبيق طلبات العقود ومتابعات تدقيق M0: `packages/mobile-kit` ‏(`useApiBaseUrl`)، و `packages/api-client` (تمرير `signal`)، و `packages/db-kit` (مستمع `'error'` على الـ pool)، و `mobile-features/account` (متابعات account و `login.yaml`)، و `modules/identity` (حارس المسارات العامة فقط). كل بنّاء يملك ملف طلباته `docs/contract-requests/M1-<builder>.md`، و builder-geo-data يملك `docs/reports/**`.
- **إصلاحان في `CliContracts` بعد التجميد** (طلبا M1-builder-geo-data §1 و M1-builder-e2e-m1 §4):
  - `placesImport.command` أصبح `pnpm --filter @iraq-maps/places run import`، لأن `pnpm import` أمر مدمج في pnpm.
  - `benchSearch`: الخروج بـ 1 عندما يكون p95 مساوياً للميزانية أو أعلى منها، والمستدعون الذين يقرؤون stdout يشغّلونه بـ `pnpm -s`.
- **إضافتان للعقود بعد التجميد** (طلبا builder-tiles، إضافيتان فقط):
  - `OsmCategoryRules` في `packages/contracts/src/osm-categories.ts`: جدول واحد يربط وسوم OSM بـ `PlaceCategory`، مصدَّر إلى `schemas/osm-categories.json`. الـ pipeline و profile البلاطات يقرآنه بدل نسختين منفصلتين. الجدول هو جدول الـ pipeline الحالي (القواعد بالترتيب، وأول تطابق يفوز، و `*` لأي قيمة، و `no` و `vacant` لا تطابق).
  - `Glyphs` مصدَّر إلى `schemas/glyphs.json` ليقرأه CLI البلاطات.
  - اختبار `geo-data.test.ts` يفشل إن انحرف أيّ ملف JSON عن مصدره في TS.

## متابعات من تدقيق M0

> هذه ملاحظات غير حاجبة من تدقيق إغلاق M0 (الإغلاق على `2937c16`). المكامل يوزّعها على مالكيها في M1 أو بعدها. تُعالَج في M1 ما لم يُذكر غير ذلك.

**أمان**
- [x] F-2 (integrator): في `app.config.ts`، إذا كانت قيمة `EXPO_PUBLIC_APP_ENV` غير معروفة (مثل `staging`)، يُسمح بالـ cleartext بينما وقت التشغيل يعاملها كإنتاج. يجب التحقق من القيمة ضمن development و e2e و test و production، ورميُ خطأ عند prebuild لأي قيمة أخرى، مع اختبار لقيمة خاطئة إملائياً. تم: `app.config.ts` يرمي خطأ لأي قيمة أخرى، مع اختبار.
- [x] F-1 (integrator): فحص المحارف الخفية `invisible:check` يجب أن يشمل أيضاً `.toml` و `.xml` و `.gradle` و `.kts` و `.properties` و `.env.example`. تم في `tools/ownership/src/no-invisible.ts` مع اختبار.
- [ ] رفض محارف Cf في الأسماء (حقل `name`) قبل أن يعرض M6 الأسماء للآخرين. ويُعاد تقييم الرابط العميق `iraqmaps://auth/otp?phone=`، لأنه يسمح بملء أي رقم مسبقاً (خطر login-CSRF منخفض).

**معمارية و QA**
- [ ] (integrator) نقل `invisible:check` من `tools/ownership` إلى `packages/tooling`، أو إعادة تسمية الحزمة إلى repo-checks.
- [ ] (integrator) قاعدة ESLint لـ left/right تلتقط أي خاصية بهذين الاسمين في كود الواجهة. يجب حصرها بسياقات الأنماط: ‏`StyleSheet.create` و `style={{}}`.
- [ ] (integrator) ثغرة lint: نص إنجليزي يُمرَّر إلى label عبر ثابت (`const L='…'; <Button label={L}/>`) لا يُلتقط.
- [x] (account / e2e-m1) في `login.yaml`، المتغير `OUT` وتعليقه قديمان، وتدفق login يعتمد على أن launch-tabs انتهى بالعربية. الحل: اختيار العربية صراحةً في بداية login، وأسماء لقطات بسيطة. تم: حُذف `OUT`، وأسماء اللقطات بسيطة. ‏`run-flows.sh` يمسح بيانات التطبيق قبل كل تدفق فيبدأ بلغة ar-IQ، والتعليق يشرح اختيار العربية يدوياً على جهاز آخر.
- [ ] (integrator) حاجز الـ migrations يمنع الـ triggers (`$` و `EXECUTE` و `NEW.`). يُراجَع إن احتاجتها places؛ والعزل الحقيقي بأدوار لكل وحدة في M7.

**عربي و RTL وإمكانية الوصول**
- [x] (account) اختبارات account تتحقق من `direction: 'ltr'` في حقلي الهاتف والرمز.
- [x] (account) نفس رسالة الخطأ مرتين لا تُعلَن ثانيةً، والحل مسح الخطأ قبل `setError`. تم في `useRequest`، مع اختبار.
- [x] (account) العناوين انتقلت إلى الترويسة الأصلية التي لا يعرضها TalkBack كعنوان. الحل: عنوان داخل المحتوى بـ `accessibilityRole="header"`، مع إخفائه بصرياً إن تكرر. تم: `ScreenTitle` يعرض العنوان في المحتوى، والترويسة بلا عنوان، فلا تكرار.
- [x] (account / map-app) صفوف اللغة لا تُظهر حالة التعطيل أثناء الحفظ. تم: `ListItem` يقبل `disabled`، و `LanguageScreen` يمرّر `disabled={busy}`.
- [x] (e2e-m1) مراجعة لقطات المحاكي بصرياً محجوبة هنا، لأن مضيف الـ artifacts مرفوض في سياسة الشبكة. الحل: تصدير اللقطات في الـ job summary أو السجل بحجم مضغوط، أو أن يفتح المستخدم artifact ‏`e2e-output` (‏11573535777 من run 37828965227) للتحقق من تشكّل الحروف وترتيب أرقام الهاتف. تم: `e2e/mobile/screenshots-summary.sh` في نهاية `run-flows.sh`. يُتحقق منه في تشغيل android.yml التالي.

**ترخيص**
- [x] (map-app، مالك packages/ui في M1، و geo-data، مالك DATA_SOURCES) إضافة صف SF Symbols ‏(iOS فقط، من النظام ولا يُعاد توزيعه)، وتحديث عمود استخدام Material Symbols: ‏IconButton، وعلامة الاختيار في ListItem، وأيقونات التبويبات.
- [x] (geo-data) ملاحظة في `docs/reports/osm-quality-2026-10-08.md` أن سطر الإسناد حُدّث، وأن المخرج الحالي في run 37828965262.
- [ ] (integrator، M7) شاشة التراخيص: بناء القائمة من وحدات حزمة Metro، أو استثناء devDependencies الخاصة بـ workspace ‏(tooling).

**CI**
- [ ] (integrator) ترقية GitHub Actions إلى إصداراتها الرئيسية الحالية، لأن تحذيرات Node 20 تظهر، مع تثبيت SHAs جديدة.
- [ ] (M7) المحاكي يعمل الآن بلغة نظام ar-IQ فقط. يُضاف تمرير ثانٍ بلغة en-US.

**ملاحظات الجلسة B** (غير مُتحقَّق منها بعد، والجلسة B ترسل نتائجها مع اختبارات)
- [ ] mobile-kit: التوكنات تُرسل إلى عنوان خادم مطوّر محفوظ حديثاً أثناء تسجيل الدخول.
- [ ] mobile-kit: نتيجة refresh أو `/v1/me` قديمة تُطبَّق بعد تسجيل الخروج ثم الدخول.
- [ ] i18n: تغطية `Intl.PluralRules` وما يشابهها في Hermes، ودالة عزل FSI/PDI عامة في `t()`.

## ما تم إنجازه

قيد التنفيذ.

### حالة التنفيذ (لاستئناف العمل)

آخر تحديث: 2026-10-08 20:30Z.

**ما تم:**
- العقود مجمّدة في `7ef279a`، والبوابة كانت خضراء عند التجميد.
- M0 مغلقة في `2937c16`.
- خطوة الدمج 1 في `b6dc05b`: places و geo-data و map-app و e2e-m1، وربط places في apps/api، وتبعيات التطبيق و plugins ‏MapLibre و expo-location، ومسار المكان، و `useApiBaseUrl`.
- الجلسة B سلّمت builder-tiles في `38ebb1e` و builder-map-kit في `f7e1e0b`.
- خطوة الدمج 2: تبويب الخريطة يعرض `MapScreen` و `map` في المسارات المتاحة، وحُذفت استثناءات knip الأخيرة (map-kit)، ومدخلات turbo لاختبار geo-tiles، وترخيص fontnik في ADR-0008. ‏`migrate` في apps/api ينشئ postgis و pg_trgm أولاً (`ensureExtensions` في db-kit)، لأن قاعدة CI ‏(postgis/postgis) بلا pg_trgm فسقطت مهمة android e2e على b6dc05b. الإنتاج يجهّز الامتدادين مسبقاً (`infra/README.md`).

**توزيع البنّائين:**

| البنّاء | يعمل في | الحالة |
|---|---|---|
| builder-tiles | الجلسة B (`session_01Tq53xu86uvPxzMq1ocdsde`) | سُلّم في `38ebb1e` |
| builder-map-kit | الجلسة B | سُلّم في `f7e1e0b` |
| builder-geo-data | وكيل القائد في الخلفية | بدأ 19:27Z. الجلسة C اعتذرت لأن نطاقها M0 فقط |
| builder-places | وكيل القائد في الخلفية | بدأ 19:27Z |
| builder-map-app | وكيل القائد في الخلفية | بدأ 19:26Z |
| builder-e2e-m1 | وكيل القائد في الخلفية | بدأ 19:26Z |

**المهلة:** 20:58Z. بعدها يبني القائد أي جزء ناقص.

**الخطوة التالية:** map-app ينتقل إلى mock ‏map-kit، وتُطبَّق إضافتا العقود (`OsmCategoryRules` و `Glyphs` JSON) في tiles و pipeline. ثم البوابة، ثم CI ‏(ci و android و geo-data)، ثم المدققون الخمسة، ثم الإغلاق.


| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| | | | |
