---
id: M4
slug: messaging-inbox-notifications
status: not_started
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-messaging:
    - "modules/messaging/**"
  builder-whatsapp:
    - "adapters/whatsapp-cloud/**"
  builder-notifications:
    - "modules/notifications/**"
    - "adapters/push-fcm/**"
    - "mobile-features/account/**"
  builder-messages-app:
    - "mobile-features/messages/**"
    - "mobile-features/map/**"
    - "packages/mobile-kit/**"
  builder-provider-inbox-app:
    - "mobile-features/provider/**"
  builder-e2e-m4:
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
  auditor-security-m4: security-privacy
  auditor-architecture-m4: architecture-contracts
  auditor-qa-m4: qa-build
  auditor-rtl-m4: arabic-rtl-a11y
---

# M4 — محرك المراسلات: طلب واحد لعدة أماكن، والقنوات والحالات والردود، وصندوق وارد المزوّد والإشعارات

**الحالة:** لم تبدأ · **التقدير:** 3–4 ساعة · **يعتمد على:** [M3](M3-providers-media-verification.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

يكتب المستخدم طلباً واحداً، مثل «غرفة لشخصين ليلة الجمعة، كم السعر؟»، ويرسله إلى 5 أماكن كحد أقصى بعد تأكيد صريح.

يصل الطلب بإحدى ثلاث طرق:
- داخل التطبيق، للمزوّدين المسجّلين.
- عبر WhatsApp Cloud API بقالب معتمد، للمزوّدين الموافقين فقط.
- بتسليم يدوي للباقين: فتح واتساب أو إنستغرام أو اتصال، مع نسخ النص.

يتابع المستخدم حالة كل رسالة ويقرأ الردود في تبويب «مراسلات». يرد المزوّد من صندوق الوارد، وتصل الإشعارات حسب التفضيلات التي يضبطها كل منهما في «حسابي». والطلبات تتحمل انقطاع الشبكة بطابور محلي وإعادة محاولة.

## الميزات المطلوبة

- [ ] **وحدة messaging**
  - طلب لحد أقصى 5 أماكن، بمفتاح idempotency، وحد يومي لكل مستخدم.
  - اختيار القناة لكل مكان حسب ProviderDirectoryPort وقدرات القنوات.
  - القنوات:
    - in_app.
    - DeepLinkHandoff (wa.me و ig.me و tel:)، من قنوات موافق عليها، أو من بيانات OSM العامة إن اعتمدها المستخدم.
  - الحالات: queued ثم sent ثم delivered ثم read، ثم replied أو failed أو handed_off.
  - الردود، وصندوق وارد المزوّد، وإلغاء الاشتراك بنقرة.
  - الإرسال عبر outbox و BullMQ مع إعادة المحاولة.
  - UserDataEraser.
- [ ] **محوّل WhatsApp Cloud**
  - إرسال قالب معتمد، ورفض الإرسال بدون opt-in.
  - التحقق من توقيع X-Hub-Signature-256 بمقارنة آمنة زمنياً، و verify token.
  - تحويل الحالات والردود الواردة.
  - يُختبر بحمولات مسجّلة وسر يُولَّد وقت الاختبار، بلا أي token.
- [ ] **الإشعارات الفورية**
  - تسجيل الأجهزة، وتفضيلات المستخدم.
  - إشعار للمزوّد عند وصول طلب جديد، وللمستخدم عند الرد، بنص عربي بلا أرقام هواتف.
  - محوّل FCM HTTP v1 في حزمة منفصلة.
  - شاشة تفضيلات الإشعارات في حسابي.
  - بدون Firebase يتراجع تسجيل الجهاز بسلاسة.
- [ ] **تبويب المراسلات**
  - إنشاء طلب من زر «راسل» في البطاقة، أو بإضافة أماكن من البحث.
  - شاشة تأكيد تعرض قناة كل مكان.
  - طابور محلي دائم يرسل مرة واحدة عند عودة الشبكة.
  - قائمة الطلبات وحالاتها، والمحادثة والردود.
  - التسليم اليدوي: فتح الرابط ونسخ النص.
  - شاشة الإنشاء تقبل نصاً وأماكن مسبقة، ليستخدمها المساعد في M5 بلا تعديل.
- [ ] **صندوق وارد المزوّد**
  قائمة الطلبات الواردة، وتفاصيل كل طلب، والرد، وإيقاف الاستقبال.

## خارج النطاق

- قنوات SMS والبريد و Telegram.
- الرسائل بين المستخدمين، والمرفقات.
- استخراج الأسعار آلياً من الردود.

## العقود

يجمّدها المكامل في commit `chore(M4): freeze contracts` قبل أن يبدأ أي بنّاء (القواعد في [سياسة العقود](README.md#سياسة-العقود)). المحتوى المطلوب:

The integrator freezes contracts in 30 min or less. It adds:
- messaging router: POST /v1/inquiries {text, placeIds (5 or fewer), confirm:true, Idempotency-Key header}, returning a per-target plan {channel, status | handoffLink}; GET /v1/inquiries; GET /v1/inquiries/:id; provider inbox list, reply and opt-out; WhatsApp webhooks GET verify and POST
- MessageStatus with its allowed transitions
- MessagingChannel, ChannelCapabilities, DeliveryEligibility, ContactChannel, DeepLinkHandoff, HandoffLink
- events: messaging.inquiry.received.v1, messaging.message.status.v1, messaging.reply.received.v1
- notifications router: POST /v1/devices; GET and PUT /v1/notification-prefs
- PushSender
- fakes and conformance suites: FakeMessagingChannel, FakePushSender
- a typed stub for the mobile-kit offline outbox
- compose route-link params {text?, placeIds?} (reused by the assistant in M5)
- testIDs
- env names: WHATSAPP_*, PUSH_PROVIDER, FCM_SERVICE_ACCOUNT_JSON_PATH, MESSAGING_DAILY_LIMIT_PER_USER
- ownership front-matter

## توزيع الوكلاء

### البنّاؤون

يعملون بالتوازي كوكلاء في الخلفية، كلٌّ داخل مساراته فقط (انظر [البناء المتوازي](README.md#دورة-حياة-المرحلة)).

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-messaging` | `modules/messaging/**` | وحدة messaging كاملة:<br>• الطلبات والحدود، واختيار القنوات.<br>• in_app و DeepLinkHandoff.<br>• آلة الحالات، والردود، وصندوق الوارد، وإلغاء الاشتراك.<br>• idempotency، والإرسال عبر outbox و BullMQ.<br>• استقبال webhooks عبر parseInbound.<br>• UserDataEraser. |
| `builder-whatsapp` | `adapters/whatsapp-cloud/**` | • محوّل MessagingChannel لواتساب: القالب، وفحص opt-in، والتوقيع، و parseInbound.<br>• اختبارات بحمولات مسجّلة.<br>• README يشرح متغيرات WHATSAPP_* والاختبار الحي الاختياري. |
| `builder-notifications` | `modules/notifications/**`<br>`adapters/push-fcm/**`<br>`mobile-features/account/**` | • وحدة notifications: الأجهزة، والتفضيلات، ومستهلكو الأحداث، و UserDataEraser.<br>• محوّل FCM.<br>• في حسابي: شاشة تفضيلات الإشعارات، وتسجيل الجهاز مع التراجع السلس. |
| `builder-messages-app` | `mobile-features/messages/**`<br>`mobile-features/map/**`<br>`packages/mobile-kit/**` | • حزمة feature-messages: الإنشاء، والتأكيد، والقائمة، والمحادثة، والتسليم اليدوي، وتدفق Maestro.<br>• زر «راسل» في البطاقة.<br>• الطابور المحلي في mobile-kit، بمفتاح idempotency وإعادة المحاولة. |
| `builder-provider-inbox-app` | `mobile-features/provider/**` | صندوق وارد المزوّد: القائمة، والتفاصيل، والرد، وإيقاف الاستقبال، مع اختبارات RNTL وتدفق Maestro للرد. |
| `builder-e2e-m4` | `e2e/**` | • سيناريوهات المراسلة والحدود والـ webhooks والإشعارات.<br>• حسابا اختبار في الـ harness للتدفق المزدوج. |

### المكامل (integrator)

**يملك:** `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `turbo.json`، `.gitignore`، `.env.example`، `.gitleaks.toml`، `packages/tooling/**`، `packages/contracts/**`، `packages/testing/**`، `tools/ownership/**`، `apps/api/**`، `apps/mobile/*`، `apps/mobile/app/**`، `apps/mobile/src/shell/**`، `.github/workflows/ci.yml`، `.github/workflows/android.yml`، `docs/milestones/**`، `docs/adr/**`، `CLAUDE.md`

- ربط messaging بـ ProviderDirectoryPort و PlacesQueryPort.
- اختيار المحوّل الحقيقي أو الـ fake حسب env.
- workers الإرسال، ومسارات webhooks، ومستهلكو الإشعارات.
- تسجيل UserDataEraser.
- plugin الإشعارات في app.config.
- مسارات تبويب المراسلات وصندوق الوارد.

### المدققون

لم يكتب أيٌّ منهم كود هذه المرحلة، ولا يعدّلون الكود؛ يرفعون الملاحظات لمالك الملف.

| الوكيل | العدسة | يفحص |
|---|---|---|
| `auditor-security-m4` | `security-privacy (mandatory: messaging)` | • التحقق من توقيع webhook والمقارنة الآمنة زمنياً.<br>• لا إرسال بلا تأكيد أو خارج الموافقات.<br>• الحد اليومي وحد 5 أماكن.<br>• إلغاء الاشتراك.<br>• هاتف المزوّد لا يُكشف إلا بموافقة show_phone.<br>• عدم تسجيل نص الرسائل أو الأرقام.<br>• الأسرار من env فقط. |
| `auditor-architecture-m4` | `architecture-contracts` | • كل قناة adapter خلف MessagingChannel.<br>• messaging لا تعرف تفاصيل واتساب ولا تستورد providers.<br>• آلة الحالات معرّفة مرة واحدة.<br>• الطابور المحلي في mobile-kit فقط.<br>• نجاح knip و jscpd. |
| `auditor-qa-m4` | `qa-build` | • يشغّل السيناريو الكامل بنفسه.<br>• يتحقق من اختبارات انقطاع الشبكة والتكرار.<br>• يتحقق من تدفق الحسابين وكل التدفقات السابقة لنفس الـ SHA.<br>• يتحقق من تسجيل الاختبار الحي كـ «لم يُشغَّل» عند غياب المفاتيح. |
| `auditor-rtl-m4` | `arabic-rtl-a11y` | • صياغة الطلب والتأكيد.<br>• أسماء الحالات.<br>• المحادثة في RTL.<br>• وضوح شرح التسليم اليدوي وزر النسخ.<br>• قراءة الحالات بقارئ الشاشة. |

## معايير القبول

| # | المعيار | طريقة التحقق |
|---|---|---|
| 1 | طلب واحد يتوزع على القنوات الصحيحة وتتحدث الحالات والردود | `pnpm --filter @iraq-maps/e2e-api test -- messaging`:<br>• 6 places return 400<br>• with 3 places:<br>◦ registered provider A goes in_app (sent, then delivered)<br>◦ WhatsApp-consented provider B goes through FakeMessagingChannel; signed webhook statuses move it to delivered, then read<br>◦ place C is handed_off with a correct link<br>• A replies from the inbox; the user thread shows the reply with status replied<br>• the daily limit returns 429<br>• after provider opt-out the status is failed with reason opted_out |
| 2 | الإرسال المكرر لا ينشئ طلبين، وواتساب لا يُستخدم بلا موافقة | e2e-api: two POST /v1/inquiries with the same Idempotency-Key create one inquiry.<br>A provider without the whatsapp_messages consent is never sent through WhatsApp (FakeMessagingChannel records no send); it is handed off instead. |
| 3 | محوّل واتساب آمن ومطابق للبروتوكول | `pnpm --filter @iraq-maps/adapter-whatsapp-cloud test`:<br>• valid and invalid X-Hub-Signature-256 (the secret is generated at test runtime)<br>• the template payload matches the recorded Graph API fixture<br>• status and text replies are parsed<br>• a send without opt-in is refused<br>• the MessagingChannel conformance suite passes |
| 4 | روابط التسليم اليدوي صحيحة بالعربية | messaging unit test for DeepLinkHandoff: a wa.me link with URL-encoded Arabic text, and a tel: link |
| 5 | الإشعارات تحترم التفضيلات ولا تحمل بيانات شخصية | `pnpm --filter @iraq-maps/notifications test`: inquiry.received pushes to the provider through FakePushSender, with Arabic text and no phone number; when the preference is off, nothing is pushed.<br>`pnpm --filter @iraq-maps/adapter-push-fcm test`: the HTTP v1 request shape, built with a fake fetch. |
| 6 | شاشات المراسلات تتحمل انقطاع الشبكة | `pnpm --filter @iraq-maps/feature-messages test`:<br>• prefill from the place card and from route params<br>• at most 5 places<br>• the confirmation shows each channel<br>• offline, the request is queued and sent exactly once on reconnect with the same Idempotency-Key (NetInfo mocked)<br>• handoff calls Linking.openURL and copies the text to the clipboard |
| 7 | صندوق وارد المزوّد وحذف البيانات | `pnpm --filter @iraq-maps/feature-provider test -- inbox`: list, open, reply, opt-out.<br>The messaging and notifications tests call their UserDataEraser and assert the data is purged. |
| 8 | المراسلة والرد يعملان على محاكي أندرويد | android.yml e2e job green, including:<br>• mobile-features/messages/maestro/send-inquiry.yaml: request to two places, confirm, statuses sent and تسليم يدوي<br>• mobile-features/provider/maestro/reply.yaml: a second test account through the fixed OTP<br>All earlier flows also pass. |
| 9 | اختبار حي اختياري لواتساب لا يحجب الإغلاق | When WHATSAPP_* are exported by the user: `pnpm --filter @iraq-maps/adapter-whatsapp-cloud test:live`. Otherwise it is skipped with a printed notice and recorded as not run in the milestone file. |
| 10 | بوابة الجودة و CI وبناء أندرويد خضراء وموافقة المدققين ومنهم مدقق الأمان | `pnpm gate` exits 0; ci.yml and android.yml are green for the head SHA; the audit log shows every auditor APPROVED |

## المتطلبات البيئية والبدائل المؤقتة

- No WhatsApp tokens. The adapter is verified with recorded payloads and a throwaway secret generated at runtime. A live send runs only if the user exports WHATSAPP_* and has an approved Arabic template and a public webhook URL.
- No FCM service account. Tests use FakePushSender, and the Android build passes without google-services.json.
- Local redis-server for the BullMQ send and retry workers.

**البدائل المؤقتة (mocks) في هذه المرحلة:** WhatsApp Cloud API، FCM (الإشعارات الفورية)، رابط API عام للتجربة على هاتف حقيقي، Android SDK محلياً. التفاصيل وما يلزم للتشغيل الحقيقي في [MOCKS.md](MOCKS.md).

## بوابة الإغلاق

كل البنود على **نفس الـ SHA** (التفاصيل في [بوابة الإغلاق](README.md#بوابة-الإغلاق)):

- [ ] `pnpm infra:local up && pnpm install --frozen-lockfile && pnpm gate` ينجح من نسخة نظيفة
- [ ] `pnpm android:precheck` ينجح
- [ ] `ci.yml` ناجح
- [ ] `android.yml`: job ‏build ناجح (APK ‏arm64 ≤ 40MB ومرفوع كـ artifact)، و job ‏e2e ناجح (تدفقات Maestro لهذه المرحلة وكل ما قبلها)
- [ ] كل معايير القبول أعلاه مُثبتة بدليلها في «ما تم إنجازه»
- [ ] كل المدققين (4) سجّلوا `APPROVED <sha>` بلا ملاحظات حاجبة مفتوحة
- [ ] commit و push إلى `claude/iraq-smart-maps-app-aybpjn`، وتسجيل الـ SHA في الجدول أدناه، وتحديث الفهرس

## المخاطر

- موافقة Meta على القالب تستغرق أياماً خارج سيطرتنا. القناة معطّلة افتراضياً، والتسليم اليدوي يغطي الفجوة.
- رسائل مكررة عند انقطاع الشبكة. نمنعها بمفتاح idempotency على العميل والخادم.
- استخدام المراسلة لإزعاج المحلات. نضع حداً يومياً وحد 5 أماكن، ونتيح إلغاء الاشتراك فوراً.
- الإشعارات الحقيقية تحتاج google-services.json وحساب خدمة FCM من المستخدم.

## ما تم إنجازه

لم تبدأ بعد.

| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| | | | |
