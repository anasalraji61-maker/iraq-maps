# سجل مصادر البيانات والتراخيص

> أي مصدر بيانات أو صور أو خطوط أو أيقونات يجب تسجيله هنا **قبل** استخدامه. يراجعه وكيل الترخيص R3.

| المصدر | الرابط | الترخيص | استخدام تجاري | نص الإسناد | الحالة | آخر تحقق |
|---|---|---|---|---|---|---|
| OpenStreetMap (Geofabrik Iraq extract) | https://download.geofabrik.de/asia/iraq.html | ODbL 1.0 | نعم، مع share-alike لقاعدة البيانات المشتقة | © OpenStreetMap contributors | معتمد. استُخدم في `geo-data.yml` (التشغيل 37805977537). المستخرج العام لا يتضمن بيانات المستخدمين (uid/user)، لذلك عدد المساهمين غير متاح | 2026-10-08 |
| Fixture اختبار يدوي `geo-services/pipeline/tests/fixtures/mini-city.osm.xml` | — (داخل المستودع) | CC0 1.0 | نعم | لا يلزم | معتمد. عمل أصلي مكتوب يدوياً، غير مشتق من OSM | 2026-10-08 |
| Fixture اختبار يدوي `geo-services/pipeline/tests/fixtures/baghdad-mini.osm.xml`، ومخرجه `tests/fixtures/baghdad-mini/` (‏`places.ndjson` و `city.json` و `baghdad.osm.pbf`) | — (داخل المستودع) | CC0 1.0 | نعم | لا يلزم | معتمد. عمل أصلي مكتوب يدوياً بأسماء مخترعة أو عامة وإحداثيات مختلقة داخل صندوق بغداد، غير مشتق من OSM. الهواتف وهمية، والمواقع على النطاقين المحجوزين example.com و example.org | 2026-10-08 |
| Fixture اختبار يدوي `geo-services/tiles/src/test/fixtures/city.osm` | — (داخل المستودع) | CC0 1.0 | نعم | لا يلزم | معتمد. عمل أصلي مكتوب يدوياً، غير مشتق من OSM. يستخدمه `TilesTest` | 2026-10-08 |
| Copernicus Sentinel-2 L2A | https://dataspace.copernicus.eu | Copernicus open data licence | نعم | Contains modified Copernicus Sentinel data [year] | معتمد مبدئياً، بانتظار تحقق R3 | — |
| EOX Sentinel-2 cloudless | https://s2maps.eu | 2016: CC BY 4.0، والإصدارات اللاحقة: CC BY-NC-SA 4.0 | إصدار 2016 فقط | Sentinel-2 cloudless by EOX IT Services GmbH | **قيد التحقق، والإصدارات NC ممنوعة** | — |
| Landsat (USGS) | https://www.usgs.gov/landsat-missions | Public domain | نعم | Landsat imagery courtesy of USGS | احتياطي | — |

## الخطوط والأيقونات

| المصدر | الرابط | الترخيص | استخدام تجاري | نص الإسناد | الحالة | آخر تحقق |
|---|---|---|---|---|---|---|
| Noto Sans Arabic 2.012 (الوزنان 400 و 700)، عبر حزمة npm ‏`@expo-google-fonts/noto-sans-arabic` 0.4.3 | https://github.com/notofonts/arabic | SIL Open Font License 1.1 للخط، و MIT لكود الحزمة | نعم. يُضمَّن في التطبيق، ولا يُباع الخط منفرداً | Copyright 2022 The Noto Project Authors. حقوق النسخ ونص الترخيص مضمَّنان في بيانات ملف الخط (جدول name)، وهذا يفي بشرط OFL | معتمد، الخط الأساسي في `packages/ui` | 2026-10-08 |
| Material Symbols (الوزن 400)، عبر `expo-symbols` و `@expo-google-fonts/material-symbols` | https://github.com/google/material-design-icons | Apache License 2.0 للأيقونات، و MIT لكود الحزمة | نعم | لا يلزم إسناد ظاهر، لكن Apache-2.0 يشترط إرفاق نص الترخيص: يُعرض في شاشة تراخيص المصادر المفتوحة (متابعة قبل الإطلاق) | معتمد. يُستخدم في `IconButton`، وعلامة الاختيار في `ListItem`، وأيقونات التبويبات (أندرويد) | 2026-10-08 |
| SF Symbols، عبر `expo-symbols` على iOS فقط | https://developer.apple.com/sf-symbols/ | ترخيص Apple: يُستخدم كجزء من النظام في تطبيقات منصات Apple فقط | نعم، داخل تطبيق iOS | لا يلزم | معتمد، iOS فقط. الرموز من خط النظام ولا تُعاد توزيعها ولا تُضمَّن في الحزمة. نتجنب الرموز المقيدة (التي تمثّل منتجات Apple وخدماتها، وعليها ملاحظة استخدام في تطبيق SF Symbols)، ولا نستخدمها في شعار أو علامة تجارية | 2026-10-08 |
| Glyph PBFs للـ fontstack ‏`Noto Sans Arabic Regular` (256 نطاقاً تغطي BMP)، مولَّدة بـ fontnik من Noto Sans Arabic 400 (الصف أعلاه) | — (تُبنى بـ `tiles glyphs` في `geo-data.yml` وفي اختبار `geo-services/tiles`) | SIL OFL 1.1: نسخة معدّلة (Modified Version) من الخط. لا اسم خط محجوزاً (Reserved Font Name) في Noto | نعم. لا تُباع منفردة | Copyright 2022 The Noto Project Authors. نص OFL الكامل (`LICENSE_FONT` من الحزمة) يُكتب كـ `OFL.txt` داخل مجلد الـ fontstack، و `ATTRIBUTION.txt` في artifact البيانات يشير إليه | معتمد. تُرفع في artifact ‏`data-<city>-<date>` مع `OFL.txt`، وتقدّمها نقطة الاحتياط `/v1/cities/:id/glyphs` | 2026-10-08 |

## أدوات البناء (لا تُوزَّع في التطبيق ولا في artifacts البيانات)

| الأداة | الرابط | الترخيص | استخدام تجاري | نص الإسناد | الحالة | آخر تحقق |
|---|---|---|---|---|---|---|
| Planetiler 0.10.2: ‏`planetiler.jar` من GitHub release، مثبّت بـ SHA-256 في `geo-services/tiles/scripts/planetiler.sh` | https://github.com/onthegomap/planetiler | Apache-2.0. الـ jar يضم تبعياته، وقائمتها مع تراخيصها في `NOTICE.md` و `META-INF/` داخله. منها: GeoTools 34.3 بترخيص LGPL-2.1 (‏gt-api و gt-main و gt-metadata و gt-referencing و gt-shapefile و gt-http و gt-epsg-hsql، ومعها org.geotools.ogc). ويحمل gt-epsg-hsql قاعدة EPSG (بشروط استخدام EPSG) و HSQLDB ‏(BSD). ومنها أيضاً JTS ‏(EDL) و ICU4J ‏(ICU license) و Eclipse EMF 2.15 ‏(EPL-2.0، ترخيص مشروع EMF، إذ لا يذكر ملف pom داخل الـ jar ترخيصاً)، ومكتبات ImageN | نعم | لا يلزم، لأنه أداة بناء فقط | معتمد كأداة بناء في CI وعند المطورين. يُشغَّل في `tiles build` فقط، ولا يُضمَّن في التطبيق ولا في الـ artifact، فلا تنطبق شروط توزيع LGPL. وحدة planetiler-openmaptiles موجودة داخل الـ jar لكنها غير مستخدمة: البلاطات تُبنى بملف profile خاص بنا يتبع `TileSchema` | 2026-10-08 |
| osmium-tool 1.16 (حزمة Ubuntu ‏`osmium-tool`) | https://osmcode.org/osmium-tool/ | GPL-3.0-or-later | نعم | لا يلزم، لأنه أداة بناء فقط | معتمد كأداة في CI وعند المطورين: القص (`osmium extract`) وفحص الملفات. لا يُوزَّع ولا يُربط بكودنا، و GPL لا يمتد إلى مخرجاته (ملفات OSM المقصوصة تبقى ODbL) | 2026-10-08 |
| pyosmium 4.3.1 (PyPI ‏`osmium`) | https://osmcode.org/pyosmium/ | BSD-2-Clause | نعم | لا يلزم، لأنه أداة بناء فقط | معتمد كمكتبة Python في `geo-services/pipeline` (القراءة وتجميع المضلّعات). لا يُوزَّع في التطبيق | 2026-10-08 |
| fontnik 0.7.7 (npm، مع ملفات native مبنية مسبقاً) | https://github.com/mapbox/node-fontnik | BSD-3-Clause، حسب `LICENSE.txt` في الحزمة، وفيه بند عدم التزكية. ملف package.json بلا حقل ترخيص | نعم | لا يلزم، لأنه أداة بناء فقط | معتمد كأداة بناء للـ glyphs في `tiles glyphs`. لا يُوزَّع في التطبيق | 2026-10-08 |

## ممنوع
Esri World Imagery · Google Maps/Earth · Bing Maps · Mapbox Satellite · `tile.openstreetmap.org` (سياسة الاستخدام) · أي محتوى مسحوب (scraped) من Instagram أو Facebook.
