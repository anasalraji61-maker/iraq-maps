# معمارية تطبيق خرائط العراق الذكي

> الحالة: مسودة v0.1. القرارات هنا ملزمة لكل الوكلاء. أي تغيير معماري يمر بـ ADR في `docs/adr/`.
> الوثائق المرتبطة: [`MVP.md`](./MVP.md)، [`TASKS.md`](./TASKS.md)، [`../CLAUDE.md`](../CLAUDE.md).

---

## 1. المبادئ الحاكمة

1. **لا أسرار في الكود أبداً.** المستودع عام. كل مفتاح أو token أو كلمة سر يُقرأ من متغيرات بيئة (`.env` مستثنى في `.gitignore`)، ويُوثَّق اسمه فقط في `.env.example` **بدون قيمة**. التطبيق على الهاتف لا يحمل أي مفتاح خاص: كل خدمة تحتاج مفتاحاً تمر عبر الـ backend.
2. **بيانات وترخيص مفتوح فقط.** الخرائط من OpenStreetMap (ODbL)، وصور الأقمار الصناعية من مصادر ترخيصها يسمح بالاستخدام التجاري (انظر §6). كل مصدر بيانات يُسجَّل في `docs/DATA_SOURCES.md` قبل استخدامه.
3. **Modular monolith أولاً.** خادم واحد قابل للنشر، مقسّم لوحدات (modules) مستقلة بحدود صارمة. أي وحدة يمكن فصلها لاحقاً كخدمة مستقلة بدون تغيير عقودها.
4. **Contract-first.** كل تواصل بين الوحدات، وبين التطبيق والخادم، يمر عبر عقود مُعرَّفة في `packages/contracts`. لا تستورد وحدة من داخل وحدة أخرى.
5. **العربية أولاً و RTL افتراضياً.** ثم الكردية السورانية (ckb) ثم الإنجليزية.
6. **مصمَّم لظروف العراق.** أجهزة أندرويد متوسطة/ضعيفة، إنترنت متقطع، تحديد مواقع غير دقيق أحياناً، عناوين غير رسمية ("قرب جامع..."، "شارع 60").
7. **الصدق في البيانات.** الأسعار والزحمة تُعرض دائماً مع مصدرها وتاريخها ودرجة الثقة. لا نخترع بيانات.

---

## 2. الـ Stack المقترح ولماذا

| الطبقة | الاختيار | السبب |
|---|---|---|
| لغة موحّدة | **TypeScript** في كل مكان (تطبيق + خادم + عقود) | عقود مشتركة بين الهاتف والخادم بدون توليد كود بين لغتين، وفريق/وكلاء بلغة واحدة. |
| Monorepo | **pnpm workspaces + Turborepo** | عزل الحزم، بناء واختبار تزايدي (فقط ما تغيّر)، مناسب لعمل عدة وكلاء بالتوازي. |
| تطبيق الهاتف | **React Native + Expo (dev client / prebuild) + Expo Router** | أندرويد الآن و iOS لاحقاً من نفس الكود، دعم RTL ناضج، تحديثات OTA عبر EAS Update، و Expo Router يجعل كل تبويب ملفات منفصلة. |
| محرك الخريطة | **MapLibre Native** عبر `@maplibre/maplibre-react-native` | مفتوح المصدر بالكامل (لا مفاتيح Mapbox)، vector tiles، يدعم fill-extrusion للمباني ثلاثية الأبعاد (أساس للتجول 3D لاحقاً). |
| بلاطات الخريطة | **Planetiler → PMTiles** بمخطط OpenMapTiles، مستضافة على تخزين كائنات + CDN | ملف واحد لكل مدينة، بدون خادم بلاطات، رخيص جداً. **ممنوع** استخدام `tile.openstreetmap.org` (سياسة الاستخدام تمنع التطبيقات). |
| الملاحة/التوجيه | **Valhalla** (مستضاف ذاتياً) | سيارة + مشي + (لاحقاً) نقل عام، costing ديناميكي يقبل أوزان زحمة مستقبلاً، تعليمات خطوة بخطوة مع دعم لغات، ويمكن تشغيله offline على الجهاز لاحقاً. |
| البحث الجغرافي (geocoding) | **Photon** (مبني على بيانات OSM) + بحث الأماكن الخاص بنا في PostGIS | Photon خفيف وجيد مع العربية؛ وأماكن المزوّدين المسجّلين تُبحث في قاعدتنا. |
| الخادم | **NestJS (Fastify adapter)** | نظام modules + DI يطابق فكرة modular monolith، OpenAPI، ناضج. |
| العقود و API | **zod + ts-rest** | مخطط واحد = تحقق في الخادم + أنواع وعميل typed في التطبيق + توليد OpenAPI. |
| قاعدة البيانات | **PostgreSQL 16 + PostGIS + pg_trgm** | جغرافيا + بحث نصي تقريبي للعربية في محرك واحد. كل وحدة تملك **schema** خاصاً بها. |
| ORM / migrations | **Drizzle ORM** | SQL شفاف، يدعم أنواع PostGIS، migrations لكل وحدة منفصلة. |
| الطوابير والأحداث | **Redis + BullMQ**، ونمط **Transactional Outbox** للأحداث بين الوحدات | إرسال الرسائل وإعادة المحاولة والـ webhooks بشكل موثوق. |
| الملفات والصور | تخزين متوافق مع **S3** (Cloudflare R2 / MinIO محلياً) + روابط موقّعة | التطبيق يرفع مباشرة بدون أن يرى أي مفتاح. |
| المساعد الذكي | **Claude API** من الخادم فقط، مع **tool use** على أدواتنا (بحث أماكن، أسعار، زحمة، مسارات) | النموذج لا "يعرف" الأماكن؛ يستدعي أدواتنا التي تعيد بيانات حقيقية. اسم النموذج متغير بيئة (`ASSISTANT_MODEL`). |
| الإشعارات | **FCM** (أندرويد) ثم APNs | قياسي. |
| الاختبارات | **Vitest** (حزم وخادم) + **PostGIS و Redis محليان** (قواعد اختبار معزولة، بلا Testcontainers — [ADR-0004](./adr/0004-local-postgis-instead-of-testcontainers.md)) + **Jest/RNTL** (التطبيق) + **Maestro** (E2E للهاتف) | |
| الجودة والأمان | ESLint + **dependency-cruiser** (فرض حدود الوحدات) + **gitleaks** (فحص أسرار في pre-commit و CI) + **Changesets** | |
| CI | **GitHub Actions** | |

### بدائل تم رفضها (باختصار)
- **Flutter:** ممتاز للأداء، لكنه يكسر وحدة اللغة مع الخادم ويُضعف مشاركة العقود؛ و`maplibre_gl` لـ Flutter أقل نضجاً من نسخة React Native.
- **Mapbox / Google Maps SDK:** تراخيص ومفاتيح مدفوعة، ويخالفان شرط "مجاني الترخيص".
- **OSRM:** أسرع، لكن Valhalla أفضل للتعدد (multimodal) وأوزان الزحمة الديناميكية والتعليمات متعددة اللغات.
- **Microservices من اليوم الأول:** تكلفة تشغيل ضخمة لـ MVP؛ الـ modular monolith يعطي نفس العزل بدون التكلفة.

---

## 3. هيكل الـ Monorepo

```
iraq-maps/
├── apps/
│   ├── mobile/                 # React Native (Expo) — تطبيق أندرويد/iOS
│   │   ├── app/                # Expo Router: (tabs)/map, discover, messages, activity, account
│   │   └── src/
│   │       ├── shell/          # التنقل، المزوّدات (providers)، تهيئة i18n — يملكه وكيل "mobile-shell" فقط
│   │   (app/** مسارات Expo Router بسطر واحد؛ src/shell/ التخطيط والتبويبات وبوابة الدخول)
│   ├── api/                    # Composition root: يجمع الـ modules في خادم NestJS واحد
│   └── admin/                  # لوحة إدارة ويب صغيرة (توثيق المزوّدين، الإشراف على المحتوى)
│
├── mobile-features/            # كل ميزة هاتف حزمة مستقلة @iraq-maps/feature-<x> (ADR-0003)
│   ├── map/ navigation/ account/ provider/ messages/ assistant/ discover/ activity/
│   └── tour3d/                 # (مستقبلاً) — README فقط
│
├── adapters/                   # محوّل لكل خدمة خارجية @iraq-maps/adapter-<x> (llm-anthropic، whatsapp-cloud…)
│
├── modules/                    # وحدات الخادم — كل وحدة حزمة مستقلة
│   ├── identity/               # المستخدمون، OTP عبر الهاتف، الجلسات، الأدوار
│   ├── providers/              # تسجيل المزوّدين، التوثيق، الموافقات (consents)، ربط الصفحات
│   ├── places/                 # الأماكن: استيراد OSM + دمج بيانات المزوّدين + البحث
│   ├── routing/                # RoutingPort: يغلّف Valhalla
│   ├── geocoding/              # GeocoderClient: يغلّف Photon
│   ├── insights/               # الأسعار والزحمة (تقديرات مع مصدر وثقة)
│   ├── assistant/              # تنسيق LLM + الأدوات + سجل المحادثات
│   ├── messaging/              # محرك المراسلات + محوّلات القنوات (channel adapters)
│   ├── discover/               # المنشورات، الإعجابات، التعليقات، المشاركة، البلاغات
│   ├── activity/               # المحفوظات، الرحلات، السجل
│   ├── media/                  # رفع الصور، المعالجة، الروابط الموقّعة
│   ├── notifications/          # الإشعارات الفورية
│   └── tour3d/                 # (مستقبلاً) — عقد فقط بدون تنفيذ
│
├── packages/                   # حزم مشتركة
│   ├── contracts/              # ★ العقود: zod schemas، ts-rest routers، ports، events
│   ├── config/                 # قراءة متغيرات البيئة والتحقق منها (بدون أي قيم سرية)
│   ├── db-kit/                 # Drizzle، migrations لكل schema، قواعد اختبار معزولة، outbox (schema platform)
│   ├── observability/          # logger منقّح (هواتف، توكنات، إحداثيات)
│   ├── testing/                # fakes لكل port + conformance suites
│   ├── i18n/                   # نصوص ar / ckb / en + أدوات تطبيع العربية
│   ├── geo/                    # أدوات جغرافية مشتركة (bbox، مسافات، geohash، حدود المدن)
│   ├── ui/                     # Design system للهاتف (RTL، خطوط عربية، ألوان)
│   ├── mobile-kit/             # الجلسة، عميل API، روابط المسارات typed
│   ├── map-kit/                # غلاف MapLibre، الستايل، الإسناد (من M1)
│   ├── api-client/             # عميل typed مولَّد من العقود للتطبيق والإدارة
│   └── tooling/                # tsconfig و eslint و dependency-cruiser المشتركة
│
├── geo-services/               # خدمات وبيانات جغرافية (ليست TypeScript غالباً)
│   ├── pipeline/               # تنزيل Geofabrik → قص المدينة → تقارير جودة → استيراد
│   ├── tiles/                  # إعداد Planetiler + ستايلات الخريطة (عربي/كردي/إنجليزي)
│   ├── routing/                # إعداد Valhalla
│   ├── geocoder/               # إعداد Photon
│   └── imagery/                # pipeline صور Sentinel-2 → raster PMTiles
│
├── tools/ownership/            # فحص ملكية المسارات لكل مرحلة
├── e2e/                        # اختبارات API (createApp) و Maestro للهاتف
├── infra/                      # تشغيل Postgres/Redis محلياً بلا Docker، docker-compose للمطوّرين
├── docs/                       # المعمارية، ADRs، مصادر البيانات، MVP، المهام
├── .env.example                # أسماء المتغيرات فقط — بدون قيم
└── CLAUDE.md                   # تعليمات الوكلاء
```

### قواعد الاعتماد (تُفرض آلياً بـ dependency-cruiser في CI)

```
apps/*            →  packages/*  ,  modules/* (عبر index العام فقط)
modules/X         →  packages/*  فقط   (ممنوع: modules/Y)
packages/contracts →  zod و @ts-rest/core فقط (لا شيء من المشروع)
mobile-features/X →  packages/* فقط   (ممنوع: mobile-features/Y و modules/*)
adapters/X        →  packages/contracts و packages/config فقط
packages/*        →  packages/* أخرى بدون دوائر
apps/mobile       →  ممنوع: modules/*  (يتكلم مع الخادم عبر api-client فقط)
```

- كل وحدة تصدّر من `src/index.ts` فقط: الـ Nest module + تنفيذ الـ ports التي تقدّمها. أي استيراد لمسار داخلي (`modules/x/src/internal/...`) يفشل في CI.
- كل وحدة تملك schema في Postgres باسمها (`identity.*`, `places.*` ...). **ممنوع** الـ JOIN بين schemas؛ القراءة من وحدة أخرى تتم عبر port أو عبر نسخة read-model تُبنى من الأحداث.

---

## 4. العقود (Contracts) — قلب الاستقلالية

`packages/contracts` يحتوي ثلاثة أنواع من العقود:

### 4.1 عقود HTTP (التطبيق ↔ الخادم)
ts-rest routers لكل وحدة، مثلاً `contracts/http/places.ts`. الخادم ينفّذها، والتطبيق يستهلكها عبر `packages/api-client`. أي تغيير غير متوافق يتطلب نسخة جديدة (`/v2`).

### 4.2 الـ Ports (وحدة ↔ وحدة، متزامن)
واجهات TypeScript تقدّمها وحدة وتستهلكها أخرى. الـ composition root (`apps/api`) هو الوحيد الذي يربط المنفّذ بالمستهلك.

```ts
// أمثلة توضيحية للشكل فقط — التعريف الفعلي في packages/contracts
interface PlacesQueryPort {
  search(q: PlaceSearchQuery): Promise<PlaceSummary[]>;
  getById(id: PlaceId): Promise<PlaceDetails | null>;
  nearby(center: LngLat, radiusM: number, filter?: PlaceFilter): Promise<PlaceSummary[]>;
}
interface InsightsPort {
  priceRange(placeId: PlaceId, category?: string): Promise<Estimate<PriceRange> | null>;
  crowding(placeId: PlaceId, at: Date): Promise<Estimate<CrowdLevel> | null>;
}
interface RoutingPort {
  route(req: RouteRequest): Promise<RouteResult>;      // تنفيذه يغلّف Valhalla
}
interface ProviderDirectoryPort {
  contactChannels(providerId: ProviderId): Promise<ContactChannel[]>; // تحترم الموافقات
}
interface IdentityPort { verifyAccessToken(token: string): Promise<Principal>; }

// Estimate<T> يحمل دائماً: value, source, observedAt, confidence (0..1)
```

### 4.3 الأحداث (Domain Events، غير متزامن)
تُنشر عبر outbox → BullMQ. كل حدث له schema في zod ونسخة.

| الحدث | المنتج | المستهلكون |
|---|---|---|
| `identity.user.registered.v1` | identity | activity, notifications |
| `providers.provider.verified.v1` | providers | places, discover |
| `providers.consent.changed.v1` | providers | places, discover, messaging, media |
| `places.place.updated.v1` | places | assistant (فهرسة)، discover |
| `messaging.message.status.v1` | messaging | activity, notifications |
| `discover.post.reported.v1` | discover | admin |
| `media.asset.ready.v1` | media | discover, providers |

### 4.4 واجهات المزوّدين الخارجيين (Adapters)
كل خدمة خارجية خلف interface، حتى يمكن تبديلها أو محاكاتها في الاختبارات:

`OtpSender` (SMS / WhatsApp authentication) · `MessagingChannel` · `LlmClient` · `ObjectStorage` · `PushSender` · `GeocoderClient` · `RoutingEngine` · `ImageryCatalog`

---

## 5. الوحدات بالتفصيل

### 5.1 الخريطة والملاحة (mobile `features/map` + `geo-services`)
- **عرض الخريطة:** PMTiles لكل مدينة من CDN؛ ستايل بأسماء `name:ar` ← `name:ckb` ← `name` حسب لغة المستخدم.
- **البحث:** طلب واحد للخادم يجمع نتائج Photon (عناوين/شوارع) + `places` (أماكن ومزوّدين) ويرتّبها. تطبيع العربية (أ/إ/آ→ا، ة/ه، ى/ي، إزالة التشكيل والتطويل) في `packages/i18n`.
- **الملاحة:** الخادم يغلّف Valhalla (`RoutingPort`)، يعيد المسار + المناورات بالعربية. التطبيق يتابع الموقع ويعيد التوجيه عند الانحراف.
- **الإسناد (attribution):** "© OpenStreetMap contributors" ظاهر دائماً على الخريطة، وإسناد مصدر صور الأقمار عند تفعيل طبقتها.

### 5.2 المساعد الذكي (`modules/assistant`)
- يستقبل رسالة المستخدم + السياق (الموقع التقريبي، المدينة، اللغة، هدف الرحلة إن وُجد).
- **مرحلة فهم الهدف:** يصنّف الرحلة (سياحة، عمل، تسوق، علاج، عائلة...) ويطلب توضيحاً عند الحاجة.
- **أدوات (tools) يستدعيها النموذج:** `search_places`، `place_details`, `price_range`، `crowding_estimate`، `plan_route`، `draft_inquiry` (يجهّز طلب مراسلة **ولا يرسله** بدون تأكيد المستخدم).
- **قاعدة صارمة:** أي مكان أو سعر أو زحمة في الرد يجب أن يأتي من نتيجة أداة؛ الرد يحمل `placeIds` تُعرض على الخريطة كبطاقات.
- المفتاح والنموذج في متغيرات البيئة فقط (`ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`). حدود استخدام لكل مستخدم وتسجيل التكلفة.
- لا تُرسل أرقام هواتف أو بيانات شخصية للنموذج إلا عند الضرورة.

### 5.3 الأسعار والزحمة (`modules/insights`)
لا توجد مصادر مجانية رسمية لهذه البيانات في العراق، لذلك تُبنى من مصادرنا مع إظهار ذلك للمستخدم:
- **الأسعار:** (1) قوائم/نطاقات يدخلها المزوّد، (2) بلاغات المستخدمين، (3) ردود المزوّدين على المراسلات (بموافقة). كل قيمة لها `source` و `observedAt`.
- **الزحمة:** (1) تقدير حسب الوقت/اليوم/نوع المكان (heuristic أولي)، (2) بلاغات المستخدمين ("مزدحم الآن")، (3) لاحقاً: بيانات سرعة مجمّعة ومجهولة الهوية من التطبيق بموافقة صريحة (opt-in).
- واجهة `CrowdingSource` تسمح بإضافة مصادر جديدة بدون تغيير المستهلكين.

### 5.4 محرك المراسلات (`modules/messaging`)
المستخدم يكتب طلباً واحداً ("أريد غرفة لشخصين ليلة الجمعة، كم السعر؟")، ويختار عدة أماكن، والمحرك يوزّعه.

```ts
interface MessagingChannel {
  readonly id: ChannelId;               // 'in_app' | 'whatsapp_cloud' | 'sms' | 'email' | 'telegram_bot' ...
  capabilities(): ChannelCapabilities;  // canInitiate, needsTemplate, needsRecipientOptIn, supportsReplies
  canDeliver(target: ContactChannel): Promise<DeliveryEligibility>;
  send(msg: OutboundMessage): Promise<SendReceipt>;
  parseInbound?(webhook: RawWebhook): Promise<InboundMessage[]>; // للردود
}
// قناة غير مدعومة رسمياً ← لا adapter، بل DeepLinkHandoff:
interface DeepLinkHandoff { buildLink(target: ContactChannel, text: string): HandoffLink; }
```

| القناة | النوع | ملاحظات |
|---|---|---|
| داخل التطبيق (للمزوّدين المسجّلين) | **آلي** — الأساس | الأكثر موثوقية، والمزوّد يرد من وضع المزوّد. |
| WhatsApp Business Platform (Cloud API) | **آلي بشروط** | بدء المحادثة يتطلب **قالباً معتمداً** و**موافقة المستلم (opt-in)**؛ لذلك يُستخدم فقط مع مزوّدين وافقوا عند التسجيل. |
| SMS عبر مزوّد رسمي | **آلي بشروط** | للمزوّدين الموافقين؛ كلفة لكل رسالة. |
| البريد الإلكتروني | آلي | للفنادق والشركات. |
| Telegram Bot API | آلي جزئياً | البوت لا يستطيع البدء؛ يعمل فقط إذا بدأ المزوّد المحادثة مع البوت. |
| Instagram / Facebook / Viber / واتساب لغير الموافقين / اتصال | **تسليم يدوي** | فتح رابط عميق (`wa.me`، `ig.me`، `viber://`، `tel:`) مع نسخ نص الطلب للحافظة. |

- **سياسة مكافحة الإزعاج:** حد أقصى للأماكن لكل طلب، حد يومي لكل مستخدم، إلغاء الاشتراك للمزوّد بنقرة، والاحترام الكامل للموافقات (`ProviderDirectoryPort` لا يعيد قناة لم يوافق عليها المزوّد).
- كل رسالة لها حالة (`queued → sent → delivered → read → replied | failed | handed_off`) تظهر في تبويب "مراسلات".

### 5.5 المزوّدون (`modules/providers`)
- التسجيل: رقم هاتف **إلزامي** يُوثَّق بـ OTP، الاسم، الفئة، الموقع على الخريطة (أو ربط بمكان OSM موجود — "claim").
- **الموافقات (Consents)** سجل مستقل وقابل للتدقيق: `{scope, grantedAt, revokedAt, evidence}` لكل من: عرض الصور، ربط صفحة إنستغرام/فيسبوك/موقع، استقبال رسائل واتساب/SMS، عرض الأسعار. سحب الموافقة يُطلق `consent.changed` فتُخفى البيانات فوراً.
- **ربط الصفحات:** نخزّن الرابط فقط ونعرضه، ولا نسحب (scrape) محتوى من منصات أخرى. الصور يرفعها المزوّد بنفسه أو يوافق على صور محددة.
- التوثيق: حالة `pending → verified → suspended`، والإدارة تراجع عبر `apps/admin`.

### 5.6 اكتشف (`modules/discover`)
- منشورات: صورة/صور + مكان مرتبط + نص. المصدر: مزوّدون موثّقون ومستخدمون.
- إعجاب، تعليق (بمستوى واحد في MVP)، مشاركة (رابط عميق للمكان/المنشور)، بلاغ.
- الـ feed: حسب المدينة + القرب + الحداثة + التفاعل (ترتيب بسيط بدون ML في MVP).
- إشراف: بلاغات ← قائمة في لوحة الإدارة؛ فلتر كلمات أولي.

### 5.7 الهوية (`modules/identity`)
- تسجيل دخول برقم الهاتف + OTP (`OtpSender`: SMS أو WhatsApp authentication template).
- access token قصير + refresh token مع تدوير. أدوار: `user`, `provider`, `moderator`, `admin`.
- حذف الحساب من داخل التطبيق (متطلب Google Play).

### 5.8 نشاطي، الوسائط، الإشعارات
- `activity`: أماكن محفوظة، رحلات/مسارات سابقة، طلبات مراسلة، منشوراتي — read-model يُبنى من الأحداث.
- `media`: رفع مباشر بروابط موقّعة، تصغير وإزالة بيانات EXIF (خصوصاً الموقع)، حدث `asset.ready`.
- `notifications`: FCM، تفضيلات المستخدم.

### 5.9 التجول ثلاثي الأبعاد (مرحلة لاحقة — معمارية فقط)
مكان محجوز بدون تنفيذ:
- `modules/tour3d` + `apps/mobile/src/features/tour3d` + عقد `Tour3DPort` في contracts.
- **المستوى 1 (رخيص):** مباني OSM مجسّمة بـ `fill-extrusion` في MapLibre (يحتاج `building:levels`/`height`) + كاميرا مائلة + جولة مسار متحركة.
- **المستوى 2:** 3D Tiles (OGC) من مصادر مفتوحة أو مولّدة، عرض عبر مكتبة مستقلة خلف واجهة `Scene3DRenderer`.
- **المستوى 3:** صور 360/بانوراما يرفعها المزوّدون بموافقتهم (يعيد استخدام `media` و `consents`).
- القرار يُتخذ بـ ADR عند بدء المرحلة؛ لا شيء في MVP يعتمد عليه.

---

## 6. البيانات والترخيص

| المصدر | الترخيص | الاستخدام | الشروط |
|---|---|---|---|
| OpenStreetMap (عبر Geofabrik extract للعراق) | ODbL 1.0 | البلاطات، التوجيه، البحث، الأماكن | إسناد ظاهر. أي **قاعدة بيانات مشتقة** ننشرها تخضع لـ share-alike؛ لذلك بيانات المزوّدين تُخزَّن **منفصلة** عن بيانات OSM (collective database) ولا تُدمج في جداول OSM. |
| Copernicus Sentinel-2 (L2A) | ترخيص Copernicus المفتوح (استخدام تجاري مسموح مع إسناد) | طبقة أقمار صناعية | دقة 10م فقط — لا تكفي لرؤية المباني بوضوح. نعالجها ذاتياً إلى raster PMTiles. |
| EOX Sentinel-2 cloudless | **إصدار 2016: CC BY 4.0 / الإصدارات اللاحقة: CC BY-NC-SA 4.0 (غير تجاري)** | خيار جاهز | يجب التحقق من الإصدار؛ الإصدارات غير التجارية **ممنوعة** في تطبيق تجاري. |
| Landsat (USGS) | ملكية عامة | احتياطي | دقة 30م. |
| OpenAerialMap | غالباً CC BY 4.0 (لكل صورة ترخيصها) | صور عالية الدقة إن وُجدت لمناطقنا | تغطية متقطعة؛ التحقق صورة بصورة. |
| **ممنوع:** Esri World Imagery، Google، Bing، Mapbox Satellite | تراخيص مقيّدة | — | الإذن الممنوح لمحرري OSM لا يشمل التطبيقات. |

**تنبيه واقعي:** لا توجد صور أقمار صناعية عالية الدقة (أقل من 1م) مجانية الترخيص للاستخدام التجاري تغطي العراق بشكل كامل. طبقة الأقمار في MVP ستكون منظراً عاماً (10م)، ويجب توضيح ذلك في التصميم. واجهة `ImageryCatalog` تسمح بإضافة مصدر أفضل لاحقاً.

كل مصدر جديد يُضاف إلى `docs/DATA_SOURCES.md` (الرابط، الترخيص، تاريخ التحقق، نص الإسناد) **قبل** استخدامه، ووكيل الترخيص يراجعه.

---

## 7. الأمان والخصوصية

- **الأسرار:** `.env` محلياً، GitHub Actions secrets في CI، secret manager في الإنتاج، EAS secrets لبناء التطبيق. `packages/config` يرفض بدء الخادم إذا نقص متغير مطلوب، ولا يطبع القيم في السجلات أبداً.
- **gitleaks** في pre-commit وفي CI؛ أي تسريب = إيقاف الدمج + تدوير المفتاح فوراً (حذف commit لا يكفي في مستودع عام).
- **التطبيق لا يحمل أسراراً:** فقط عناوين عامة (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_TILES_URL`). أي شيء يبدأ بـ `EXPO_PUBLIC_` يُعتبر علنياً.
- **الموقع:** دقة مخفّضة في السجلات والتحليلات، حذف EXIF من الصور، تتبع السرعة للزحمة opt-in فقط.
- **أرقام الهواتف:** مشفّرة على مستوى الحقل، لا تظهر لمستخدمين آخرين إلا بموافقة المزوّد.
- **حدود المعدّل (rate limiting)** على OTP والمراسلات والمساعد.
- **مراجعة أمنية** إلزامية لأي تغيير في `identity` أو `messaging` أو `providers` (الموافقات).

---

## 8. التوسع مدينة مدينة

- **المدينة = إعداد بيانات، لا كود.** `geo-services/pipeline/cities/<city>.yaml`: الحدود (bbox/polygon)، اللغات الافتراضية، الفئات المفعّلة.
- الـ pipeline لكل مدينة: قص OSM → تقرير جودة → PMTiles → بلاطات Valhalla → فهرس Photon → استيراد `places`.
- كل جدول مكاني يحمل `city_id`؛ التطبيق يكتشف المدن المتاحة من `GET /cities`.
- **بوابة إطلاق مدينة:** تقرير الجودة يتجاوز حدوداً دنيا (نسبة الشوارع المسمّاة، عدد الأماكن ذات الأسماء العربية، الاتصال الشبكي للطرق) + حملة تسجيل مزوّدين محلية.

---

## 9. النشر (مبدئي)

- **التطوير:** `infra/docker-compose.yml` (Postgres/PostGIS، Redis، MinIO، Valhalla، Photon) + `pnpm dev`.
- **الإنتاج (MVP):** حاوية `apps/api` + Postgres مُدار + Redis مُدار + تخزين كائنات + CDN للبلاطات + خادم Valhalla/Photon. منطقة استضافة قريبة من العراق لتقليل التأخير.
- **التطبيق:** EAS Build → Google Play (internal testing → closed → production).

---

## 10. سجل القرارات (ADR)

كل قرار معماري جديد أو تغيير لهذه الوثيقة: `docs/adr/NNNN-title.md` (السياق، القرار، البدائل، العواقب). القرارات الأولية أعلاه تُعتبر ADR-0001.
