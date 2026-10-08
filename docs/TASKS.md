# تقسيم العمل للوكلاء المتوازيين

> القاعدة الذهبية: **كل مهمة تملك مسارات محددة ولا تكتب خارجها.** المسارات المشتركة (العقود، composition root، shell التطبيق) لها **مالك واحد** فقط.
> كل مهمة تعمل على فرع خاص بها `agent/<task-id>-<slug>` وتفتح PR مستقلاً.

---

## 0. ملكية الملفات المشتركة

| المسار | المالك الوحيد | كيف يطلب الآخرون تغييراً |
|---|---|---|
| `packages/contracts/**` | **T00 / وكيل العقود (contracts-steward)** | ملف اقتراح في `docs/contract-requests/<task-id>.md` ← الوكيل يدمجه في دفعة واحدة |
| `apps/api/src/**` (composition root) | **T20 / وكيل التكامل** | كل وحدة تصدّر Nest module جاهزاً؛ التكامل يربطه |
| `apps/mobile/app/_layout.tsx`، `apps/mobile/app/(tabs)/_layout.tsx`، `apps/mobile/src/shell/**` | **T10 / mobile-shell** | كل feature تصدّر شاشاتها من `features/<x>/index.ts`؛ ملفات الـ route تكون سطراً واحداً يعيد التصدير |
| `pnpm-workspace.yaml`، `turbo.json`، `package.json` الجذري، `.github/workflows/**` | **T00** ثم **T20** | طلب في PR description |
| `.env.example` | كل مهمة تضيف **قسمها فقط** (قسم مُعلَّم باسم الوحدة) — ويراجعه وكيل الأمان | — |
| `docs/ARCHITECTURE.md`، `docs/adr/**` | **وكيل المعمارية (مراجع)** | ADR مقترح في PR |
| `docs/DATA_SOURCES.md` | **T02** ويراجعه وكيل الترخيص | — |

> تعارض الملفات المسموح الوحيد: `pnpm-lock.yaml`. يُحل بإعادة `pnpm install` بعد الدمج، وليس يدوياً.

---

## 1. الموجات (Waves)

```
الموجة 0 (تسلسلية، وكيل واحد)   →  T00 الهيكل + العقود v0      ،  T01 تقرير جودة OSM (بالتوازي مع T00)
الموجة 1 (متوازية بالكامل)       →  T02..T16  (كلها تعتمد فقط على عقود v0)
الموجة 2 (تكامل)                 →  T20 ربط الخادم  ،  T21 E2E  ،  T22 نشر تجريبي
المراجعة                         →  R1..R6 تعمل على كل PR وفي نهاية كل موجة
```

---

## 2. الموجة 0 — الأساس

### T00 — هيكل الـ monorepo والعقود v0 *(مانع لكل ما بعده)*
- **يملك:** الجذر (`package.json`، `pnpm-workspace.yaml`، `turbo.json`، `.github/workflows/`)، `packages/tooling`، `packages/config`، `packages/contracts`، `.env.example` (الهيكل)، `infra/docker-compose.yml`، و`.gitleaks.toml` مع pre-commit.
- **المخرجات:** حزم فارغة لكل وحدة ومجلد، بحيث `pnpm build && pnpm test && pnpm lint` تنجح. قواعد dependency-cruiser من §3 في المعمارية. CI يشغّل lint وtypecheck وtest وgitleaks. العقود v0 لكل الـ ports والأحداث وts-rest routers بأنواع كاملة وبدون تنفيذ.
- **القبول:** وكيل المعمارية R1 يوافق على العقود قبل فتح الموجة 1.

### T01 — تقرير جودة OSM واختيار المدينة *(بالتوازي مع T00)*
- **يملك:** `geo-services/pipeline/quality/**`، و`docs/reports/osm-quality-<date>.md`.
- **المخرجات:** سكربت قابل لإعادة التشغيل، يعمل على Geofabrik extract وليس على Overpass العام عند الحجم الكبير، ويحسب مقاييس بوابة القرار في [`MVP.md`](./MVP.md#بوابة-القرار-تنفذها-المهمة-t01) لبغداد وأربيل.
- **القبول:** تقرير بالأرقام + توصية + ADR-0002 "المدينة الأولى".

---

## 3. الموجة 1 — متوازية

> كل مهمة: اختبارات وحدة، وREADME قصير في حزمتها، وmocks للـ ports التي تستهلكها. تستخدم `packages/contracts` كما هي، وأي نقص يُطلب عبر `docs/contract-requests/`.

### بيانات وخدمات جغرافية
| ID | المهمة | يملك حصرياً | يعتمد على |
|---|---|---|---|
| **T02** | Pipeline المدينة: تنزيل، قص، config المدن، استيراد أماكن OSM إلى `places` staging | `geo-services/pipeline/` (عدا `quality/`)، `docs/DATA_SOURCES.md` | T00 |
| **T03** | البلاطات والستايل: Planetiler → PMTiles، ستايل MapLibre عربي/كردي/إنجليزي، خطوط glyphs عربية | `geo-services/tiles/` | T00 |
| **T04** | التوجيه: إعداد Valhalla + محوّل `RoutingEngine` + تعليمات عربية | `geo-services/routing/`، `modules/routing/` | T00 |
| **T05** | البحث الجغرافي: Photon + محوّل `GeocoderClient` + تطبيع عربي | `geo-services/geocoder/`، `modules/geocoding/`، `packages/i18n/src/normalize/` | T00 |
| **T06** | صور الأقمار: pipeline Sentinel-2 → raster PMTiles + `ImageryCatalog` + سجل التراخيص | `geo-services/imagery/` | T00 |

### وحدات الخادم
| ID | المهمة | يملك حصرياً |
|---|---|---|
| **T07** | `identity`: OTP (`OtpSender` + mock)، JWT، الأدوار، حذف الحساب | `modules/identity/` |
| **T08** | `providers`: التسجيل، المطالبة بمكان، سجل الموافقات، التوثيق | `modules/providers/` |
| **T09** | `places`: نموذج المكان، البحث (PostGIS + pg_trgm)، فصل بيانات OSM عن المزوّد | `modules/places/` |
| **T11** | `messaging`: المحرك، الحالات، `in_app` + `whatsapp_cloud` + `DeepLinkHandoff`، مكافحة الإزعاج | `modules/messaging/` |
| **T12** | `assistant`: `LlmClient` + الأدوات + فهم الهدف + الحدود + evals بالعربية | `modules/assistant/` |
| **T13** | `insights`: الأسعار والزحمة كـ `Estimate<T>` + بلاغات المستخدمين | `modules/insights/` |
| **T14** | `discover` + `media`: المنشورات والتفاعل والبلاغات، رفع الصور وحذف EXIF | `modules/discover/`، `modules/media/` |
| **T15** | `activity` + `notifications`: read-models من الأحداث، FCM | `modules/activity/`، `modules/notifications/` |

### الواجهات
| ID | المهمة | يملك حصرياً |
|---|---|---|
| **T10** | Mobile shell: Expo، التنقل بـ 5 تبويبات، RTL، i18n، المصادقة في الواجهة، `api-client` | `apps/mobile/app/_layout.tsx`، `apps/mobile/app/(tabs)/_layout.tsx`، `apps/mobile/src/shell/`، `packages/ui/`، `packages/api-client/`، `packages/i18n/` (عدا `normalize/`) |
| **T10a** | Feature: الخريطة والبحث والملاحة وطبقة الأقمار | `apps/mobile/src/features/map/`، `apps/mobile/app/(tabs)/map*` |
| **T10b** | Feature: المساعد | `apps/mobile/src/features/assistant/`، `apps/mobile/app/assistant*` |
| **T10c** | Feature: اكتشف | `apps/mobile/src/features/discover/`، `apps/mobile/app/(tabs)/discover*` |
| **T10d** | Feature: المراسلات | `apps/mobile/src/features/messages/`، `apps/mobile/app/(tabs)/messages*` |
| **T10e** | Feature: نشاطي + حسابي + وضع المزوّد | `apps/mobile/src/features/{activity,account}/`، `apps/mobile/app/(tabs)/{activity,account}*`، `apps/mobile/app/provider*` |
| **T16** | لوحة الإدارة | `apps/admin/` |

> T10a–T10e تبدأ بعد أن يدمج T10 الـ shell، أو تعمل بالتوازي على mocks مع `packages/ui` نسخة v0 من T00. كل feature تُختبر معزولة.

---

## 4. الموجة 2 — التكامل
| ID | المهمة | يملك حصرياً |
|---|---|---|
| **T20** | ربط الوحدات في `apps/api`، الـ outbox والطوابير، health checks، OpenAPI | `apps/api/` |
| **T21** | اختبارات E2E: API بـ Testcontainers + هاتف بـ Maestro لسيناريوهات MVP الأساسية | `e2e/` |
| **T22** | النشر التجريبي: IaC، CDN للبلاطات، EAS Build لقناة internal testing | `infra/` (عدا docker-compose)، `apps/mobile/eas.json` |

---

## 5. وكلاء الفحص والتدقيق

تعمل كـ reviewers على كل PR، **ولا تكتب كود ميزات**. تكتب تعليقات، أو تفتح PR إصلاح صغيراً بموافقة المالك.

| ID | الوكيل | ماذا يفحص | يحجب الدمج عند |
|---|---|---|---|
| **R1** | **مراجع المعمارية والعقود** | حدود الوحدات، استيراد مسارات داخلية، JOIN بين schemas، توافق العقود مع النسخ السابقة، ملكية الملفات حسب §0 | كسر حدود، تعديل خارج المسارات المملوكة، تغيير عقد غير متوافق بدون نسخة جديدة |
| **R2** | **مدقق الأمان والخصوصية** | أسرار في الكود، `EXPO_PUBLIC_` يحمل شيئاً سرياً، المصادقة والتفويض، rate limits، تسجيل بيانات شخصية، EXIF، التحقق من توقيع webhooks | أي سر أو token، أو endpoint بدون تفويض. **إلزامي** على identity وmessaging وproviders |
| **R3** | **مدقق الترخيص والبيانات** | كل مصدر بيانات أو صورة أو خط مسجّل في `DATA_SOURCES.md`، توافق الترخيص التجاري، الإسناد ظاهر، فصل بيانات OSM عن بيانات المزوّد (ODbL)، تراخيص حزم npm | مصدر غير مسجل، ترخيص NC/ND، Esri أو Google، أو إسناد غائب |
| **R4** | **مدقق الجودة والاختبارات** | تغطية المنطق الأساسي، اختبارات حقيقية بدل mocks شكلية، تشغيل `pnpm test` على المتأثر، سيناريوهات الفشل والشبكة الضعيفة | اختبارات فاشلة أو متخطاة، أو منطق جديد بدون اختبار |
| **R5** | **مدقق العربية وRTL وإمكانية الوصول** | النصوص عبر i18n وليست hardcoded، الاتجاه، الخطوط، الأرقام العربية/الهندية حسب الإعداد، التباين، أحجام اللمس، قارئ الشاشة | نص ثابت في الواجهة، أو كسر RTL |
| **R6** | **مدقق المساعد الذكي** | evals عربية: هلوسة أماكن أو أسعار، استدعاء الأدوات، عدم الإرسال بدون تأكيد، تسريب بيانات شخصية للنموذج، التكلفة لكل محادثة | رد يحتوي مكاناً أو سعراً ليس من نتيجة أداة |

**التشغيل:** كل PR يمر على R1 + R4 دائماً، وعلى البقية حسب المسارات المتأثرة:
`modules/identity|messaging|providers` → R2 · `geo-services/**`، `docs/DATA_SOURCES.md` → R3 · `apps/mobile|apps/admin|packages/ui|packages/i18n` → R5 · `modules/assistant` → R6.

في نهاية كل موجة يُجري **R1 + R2** تدقيقاً شاملاً على `main`.

---

## 6. تعريف "منتهي" لأي مهمة
- [ ] لا ملفات معدّلة خارج المسارات المملوكة. يتحقق منها R1 آلياً بـ `git diff --name-only`.
- [ ] `pnpm turbo run lint typecheck test --filter=...[origin/main]` ينجح.
- [ ] gitleaks نظيف، ولا قيم في `.env.example`.
- [ ] README للحزمة يشرح: ماذا تقدم، أي ports تنفذ وتستهلك، ومتغيرات البيئة المطلوبة.
- [ ] موافقة الـ reviewers المعنيين.
