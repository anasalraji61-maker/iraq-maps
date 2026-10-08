# سجل مصادر البيانات والتراخيص

> أي مصدر بيانات أو صور أو خطوط أو أيقونات يجب تسجيله هنا **قبل** استخدامه. يراجعه وكيل الترخيص R3.

| المصدر | الرابط | الترخيص | استخدام تجاري | نص الإسناد | الحالة | آخر تحقق |
|---|---|---|---|---|---|---|
| OpenStreetMap (Geofabrik Iraq extract) | https://download.geofabrik.de/asia/iraq.html | ODbL 1.0 | نعم، مع share-alike لقاعدة البيانات المشتقة | © OpenStreetMap contributors | معتمد. استُخدم في `geo-data.yml` (التشغيل 37805977537). المستخرج العام لا يتضمن بيانات المستخدمين (uid/user)، لذلك عدد المساهمين غير متاح | 2026-10-08 |
| Fixture اختبار يدوي `geo-services/pipeline/tests/fixtures/mini-city.osm.xml` | — (داخل المستودع) | CC0 1.0 | نعم | لا يلزم | معتمد. عمل أصلي مكتوب يدوياً، غير مشتق من OSM | 2026-10-08 |
| Fixture اختبار يدوي `geo-services/pipeline/tests/fixtures/baghdad-mini.osm.xml`، ومخرجه `tests/fixtures/baghdad-mini/` (‏`places.ndjson` و `city.json`) | — (داخل المستودع) | CC0 1.0 | نعم | لا يلزم | معتمد. عمل أصلي مكتوب يدوياً بأسماء مخترعة أو عامة وإحداثيات مختلقة داخل صندوق بغداد، غير مشتق من OSM. الهواتف وهمية، والمواقع على النطاقين المحجوزين example.com و example.org | 2026-10-08 |
| Copernicus Sentinel-2 L2A | https://dataspace.copernicus.eu | Copernicus open data licence | نعم | Contains modified Copernicus Sentinel data [year] | معتمد مبدئياً، بانتظار تحقق R3 | — |
| EOX Sentinel-2 cloudless | https://s2maps.eu | 2016: CC BY 4.0، والإصدارات اللاحقة: CC BY-NC-SA 4.0 | إصدار 2016 فقط | Sentinel-2 cloudless by EOX IT Services GmbH | **قيد التحقق، والإصدارات NC ممنوعة** | — |
| Landsat (USGS) | https://www.usgs.gov/landsat-missions | Public domain | نعم | Landsat imagery courtesy of USGS | احتياطي | — |

## الخطوط والأيقونات

| المصدر | الرابط | الترخيص | استخدام تجاري | نص الإسناد | الحالة | آخر تحقق |
|---|---|---|---|---|---|---|
| Noto Sans Arabic 2.012 (الوزنان 400 و 700)، عبر حزمة npm ‏`@expo-google-fonts/noto-sans-arabic` 0.4.3 | https://github.com/notofonts/arabic | SIL Open Font License 1.1 للخط، و MIT لكود الحزمة | نعم. يُضمَّن في التطبيق، ولا يُباع الخط منفرداً | Copyright 2022 The Noto Project Authors. حقوق النسخ ونص الترخيص مضمَّنان في بيانات ملف الخط (جدول name)، وهذا يفي بشرط OFL | معتمد، الخط الأساسي في `packages/ui` | 2026-10-08 |
| Material Symbols (الوزن 400)، عبر `expo-symbols` و `@expo-google-fonts/material-symbols` | https://github.com/google/material-design-icons | Apache License 2.0 للأيقونات، و MIT لكود الحزمة | نعم | لا يلزم إسناد ظاهر، لكن Apache-2.0 يشترط إرفاق نص الترخيص: يُعرض في شاشة تراخيص المصادر المفتوحة (متابعة قبل الإطلاق) | معتمد. يُستخدم في `IconButton`، وعلامة الاختيار في `ListItem`، وأيقونات التبويبات (أندرويد) | 2026-10-08 |
| SF Symbols، عبر `expo-symbols` على iOS فقط | https://developer.apple.com/sf-symbols/ | ترخيص Apple: يُستخدم كجزء من النظام في تطبيقات منصات Apple فقط | نعم، داخل تطبيق iOS | لا يلزم | معتمد، iOS فقط. الرموز من خط النظام ولا تُعاد توزيعها ولا تُضمَّن في الحزمة. نتجنب الرموز المقيدة (التي تمثّل منتجات Apple وخدماتها، وعليها ملاحظة استخدام في تطبيق SF Symbols)، ولا نستخدمها في شعار أو علامة تجارية | 2026-10-08 |

## ممنوع
Esri World Imagery · Google Maps/Earth · Bing Maps · Mapbox Satellite · `tile.openstreetmap.org` (سياسة الاستخدام) · أي محتوى مسحوب (scraped) من Instagram أو Facebook.
