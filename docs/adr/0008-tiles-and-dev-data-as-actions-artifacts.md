# ADR-0008: البلاطات وبيانات المدينة كـ Actions artifacts، مع احتياط من الخادم

**الحالة:** مقبول · **التاريخ:** 2026-10-08

## السياق

- لا استضافة إنتاجية ولا CDN قبل M7 (انظر [`MOCKS.md`](../milestones/MOCKS.md)). وسياسة الفرع تمنع GitHub Releases والوسوم.
- مستخرج Geofabrik يصل إليه CI فقط، لا بيئة الوكلاء.
- planetiler-core منشور على Maven Central، و Java 21 و Maven متاحان محلياً وعلى GitHub runners. لكن planetiler-core يعتمد على GeoTools، وهو غير موجود على Maven Central. مستودعه repo.osgeo.org محجوب هنا (403 من الـ proxy). Planetiler يحتاج GeoTools وقت التشغيل حتى لبلاطات OSM فقط (`Arguments.bounds`)، وهذا ثابت بتجربة.
- الأسماء العربية على الخريطة تحتاج glyphs مبنية من خط مسجّل في `docs/DATA_SOURCES.md`.
- دعم `pmtiles://` عبر إعادة توجيه GitHub في MapLibre Native 13.6.1 غير مؤكد.

## القرار

1. **البناء في `geo-data.yml` لكل مدينة.** السلسلة بأوامر `CliContracts` في `packages/contracts`:
   - `pipelineExtract` يقص المستخرج ويكتب `places.ndjson` و `city.json`.
   - `tilesBuild` يبني PMTiles بـ Planetiler، بملف profile لـ OSM فقط مطابق لـ `TileSchema`.
   - `glyphsBuild` يبني الـ glyphs.

   الناتج artifact باسم `data-<city>-<date>` فيه `<city>.pmtiles`، و `glyphs/<fontstack>/<range>.pbf`، و `places.ndjson`، و `city.json`، و `ATTRIBUTION.txt` (إسناد ODbL لـ OSM، و OFL للخط). job الأداء يستورد البيانات إلى PostGIS داخل CI ويشغّل `benchSearch`.
2. **محلياً وفي الاختبارات** تُستخدم fixtures فقط (`baghdad-mini.osm` بترخيص CC0)، بنفس الأوامر.
3. **احتياط من الخادم.** `modules/places` يقدّم:
   - `GET /v1/cities/:id/tiles/:z/:x/:y` من ملف PMTiles في `TILES_SOURCE` (مسار محلي أو رابط https، يُقرأ بمكتبة `pmtiles` بطلبات range).
   - `GET /v1/cities/:id/glyphs/:fontstack/:range` من `GLYPHS_SOURCE`.

   `CityDescriptor.tilesUrl` يكون `pmtiles://https://...` عند وجود رابط عام، وإلا قالب XYZ نسبي لمسار الاحتياط، ويحلّه التطبيق مقابل عنوان الخادم. معاملات المسار يتحقق منها العقد بتعابير منتظمة صارمة، ولا يُبنى مسار ملف من مدخلات المستخدم خارج المصدر المحدد.
4. **Planetiler من jar التوزيع.** مشروع Maven في `geo-services/tiles` يعتمد على `planetiler.jar` 0.10.2 من GitHub release الخاص بـ onthegomap/planetiler (Apache-2.0، ويضم GeoTools بترخيص LGPL 2.1 كأداة بناء لا تُوزَّع في التطبيق).
   - الاعتماد بنطاق `system` في `pom.xml`.
   - `scripts/planetiler.sh` ينزّله إلى `.cache/` ويتحقق من SHA-256 المثبّت.
   - جُرّب هنا: بنى PMTiles من fixture الـ pipeline.
5. **أداة الـ glyphs: fontnik 0.7.7** (npm، BSD-2-Clause، Mapbox).
   - الحزمة تحمل ملفات native مبنية مسبقاً لـ linux-x64 و linux-arm64 و darwin، فلا تنزيل وقت التثبيت.
   - جُرّبت هنا على Node 22: ولّدت النطاقات 0-255 و 1536-1791 و 64256-65279 من `NotoSansArabic_400Regular.ttf`.
   - الخط Noto Sans Arabic من `@expo-google-fonts/noto-sans-arabic` (OFL 1.1، مسجّل في DATA_SOURCES). يغطي اللاتينية الأساسية أيضاً، فيكفي fontstack واحد: `Noto Sans Arabic Regular` (`Glyphs` في العقود).
   - MapLibre Native يشكّل العربية إلى presentation forms، لذلك `Glyphs.requiredRanges` تشمل U+FB00–U+FEFF.
   - pnpm 10 يتخطى سكربت التثبيت في fontnik (ليس في `onlyBuiltDependencies`). هذا لا يضر: السكربت يتحقق فقط من وجود الملف المبني مسبقاً، و `index.js` يحمّله مباشرة.

## البدائل المرفوضة

- **GitHub Releases أو فرع بيانات:** ممنوعان بسياسة الفرع.
- **رفع البيانات إلى المستودع:** المستودع عام، والبيانات كبيرة ومشتقة من ODbL.
- **planetiler-core من Maven Central مع استبعاد GeoTools:** يُترجم، لكنه يفشل وقت التشغيل بـ `NoClassDefFoundError` في GeoTools.
- **أدوات glyphs أخرى:**
  - font-maker: أداة ويب/WASM غير منشورة على npm.
  - ‏@kartore/glyphore 0.2.0: حديثة جداً.
  - حزم glyphs جاهزة (مثل smp-noto-glyphs): لا تُبنى من الخط المسجّل عندنا.
  - node-canvas مع tiny-sdf: يحتاج cairo native.
  - build_pbf_glyphs: يحتاج Rust و cargo.
- **tile.openstreetmap.org أو مزوّد بلاطات تجاري:** ممنوع بالقاعدة 4 في CLAUDE.md.

## العواقب

- الـ artifacts تنتهي صلاحيتها، فالبيانات الحقيقية قابلة لإعادة الإنتاج من الـ workflow لكنها لا تُحفظ دائماً.
- تجربة هاتف حقيقي خارج CI تحتاج بيانات مستضافة (MOCKS.md).
- تقديم البلاطات من الخادم يضيف حملاً مقبولاً في MVP. الـ CDN في M7.
- كل artifact يحمل ملف الإسناد، والخريطة تعرض `OSM_ATTRIBUTION` دائماً.
