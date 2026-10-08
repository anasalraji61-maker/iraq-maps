# تقارير جودة بيانات OSM

تحتوي التقارير على إحصاءات مشتقة من بيانات OpenStreetMap: © OpenStreetMap contributors، ODbL 1.0، https://www.openstreetmap.org/copyright

هذا المجلد يحفظ تقارير جودة OSM التي تحسم اختيار المدينة الأولى (بوابة القرار في [`MVP.md`](../MVP.md) §1، المهمة T01). كل تقرير محفوظ باسم `osm-quality-<date>.md`، وتاريخه هو تاريخ تشغيل CI.

## كيف يُنتَج التقرير

ينتج التقرير الـ workflow ‏[`.github/workflows/geo-data.yml`](../../.github/workflows/geo-data.yml) على GitHub runner. لا يمكن إنتاجه من بيئة الوكلاء، لأن Geofabrik و Overpass محجوبان فيها. يعمل الـ workflow عند أي push يغيّر `geo-services/pipeline/**`، أو يدوياً من تبويب Actions (‏Run workflow).

خطوات الـ job ‏`osm-quality`:
1. يشغّل اختبارات pytest للـ pipeline، ويتحقق من ملفات `geo-services/pipeline/cities/*.yaml`.
2. ينزّل `https://download.geofabrik.de/asia/iraq-latest.osm.pbf` مع إعادة المحاولة، ويتحقق من md5.
3. يقص كل مدينة بـ `osmium extract` على الـ bbox (أو الـ polygon) في ملف المدينة. الطرق التي تعبر الحدود تبقى كاملة.
4. يحسب المقاييس لكل مدينة (`quality.metrics`)، ثم يطبّق قاعدة القرار (`quality.compare`).
5. يكتب جدول Markdown في ملخص الـ job، ويرفع artifact باسم **`osm-quality-report`** فيه:
   - `erbil.json` و `baghdad.json`: مقاييس كل مدينة.
   - `osm-quality.json`: المقاييس مع القرار.
   - `osm-quality.md`: الجدول والقرار.

الـ workflow لا يستعمل أي سر ولا يدفع إلى أي فرع (`permissions: contents: read`).

## من أين نأخذ الأرقام

- من صفحة التشغيل في Actions ‏(geo-data): الجدول في الملخص، والملفات في artifact ‏`osm-quality-report`.
- أو بأداة GitHub MCP: ‏`actions_list` بالطريقة `list_workflow_run_artifacts`، ثم تنزيل الـ artifact.

ينسخ المكامل محتوى `osm-quality.md` إلى `docs/reports/osm-quality-<date>.md`، مع رابط التشغيل وتاريخ بيانات المستخرج، ثم يستشهد به في `docs/adr/0002-first-city.md`.

## تعريف المقاييس

التعريفات واحدة للمدينتين، ومصدرها `geo-services/pipeline/quality/metrics.py`:

| المقياس | التعريف |
|---|---|
| الطرق | خطوط `highway` من شبكة السيارات: motorway حتى residential، و living_street و road و service، مع وصلات `*_link`. الطول بصيغة haversine. |
| نسب أسماء الشوارع | موزونة بالطول، على الطرق ما عدا `service` و `*_link`، لأن هذه لا تُسمّى عادة. |
| الاسم العربي | يوجد `name:ar`، أو `name` مكتوب بالحرف العربي بلا حروف سورانية خاصة (ڕ ۆ ێ ڵ ە ھ). بهذا لا تُحسب الأسماء الكردية في أربيل أسماءً عربية. |
| الأماكن | أي عقدة أو خط أو علاقة فيها `amenity` أو `shop` أو `tourism` أو `office`. العدد حسب المفتاح يحسب العنصر مرة لكل مفتاح فيه. |
| الهاتف أو الساعات | `phone` أو `contact:phone` أو `mobile` أو `contact:mobile` أو `opening_hours`. |
| الاتصال الشبكي | union-find على معرّفات عقد الطرق. المقياس هو حصة أكبر مكوّن متصل من طول الطرق، ومعه حصته من العقد. |
| الحداثة | نسبة العناصر التي طابعها الزمني ضمن 24 شهراً قبل تاريخ `--as-of`، لكل العناصر، وللطرق والأماكن وحدها. |
| المساهمون | **غير متاح**: مستخرج Geofabrik العام يحذف `user` و `uid`. يُحسب فقط إذا وُجدت هذه البيانات. |

**قاعدة القرار:** نختار أربيل إلا إذا زادت كثافة الأماكن المسمّاة بالعربية في بغداد (لكل كم² من مساحة المدينة في ملف الإعداد) على كثافتها في أربيل بأكثر من 30%، **وكان** أكبر مكوّن متصل في بغداد أكبر حصةً من طول الطرق. اخترنا الكثافة لكل كم² بدل الكثافة لكل نسمة، لأن تقديرات السكان في المدينتين غير موثوقة.

**تنبيه:** حدود المدينتين صناديق تقريبية، والكثافة لكل كم² تتأثر بها. أربيل: الصندوق `[43.92, 36.11, 44.10, 36.27]` حول ما داخل الطريق الدائري 120م. بغداد: الصندوق `[44.22, 33.20, 44.55, 33.45]` يغطي المنطقة الحضرية على ضفتي دجلة. التفاصيل في `geo-services/pipeline/cities/*.yaml`.

## التشغيل محلياً

```
pnpm --filter @iraq-maps/geo-pipeline test     # pytest على fixture يدوي
cd geo-services/pipeline
sh scripts/py.sh -m quality.cities clip cities/erbil.yaml iraq-latest.osm.pbf data/erbil.osm.pbf
sh scripts/py.sh -m quality.metrics --city cities/erbil.yaml --input data/erbil.osm.pbf --as-of 2026-10-08 -o out/erbil.json
sh scripts/py.sh -m quality.compare --base out/erbil.json --challenger out/baghdad.json --json out/osm-quality.json --md out/osm-quality.md
```
