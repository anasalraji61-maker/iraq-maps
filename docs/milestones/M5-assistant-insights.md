---
id: M5
slug: assistant-insights
status: not_started
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-insights:
    - "modules/insights/**"
    - "mobile-features/map/**"
  builder-assistant:
    - "modules/assistant/**"
  builder-llm-anthropic:
    - "adapters/llm-anthropic/**"
    - "tools/assistant-evals/**"
  builder-assistant-app:
    - "mobile-features/assistant/**"
  builder-e2e-m5:
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
  auditor-assistant-m5: assistant-evals
  auditor-security-m5: security-privacy
  auditor-qa-m5: qa-build
  auditor-architecture-m5: architecture-contracts
  auditor-rtl-m5: arabic-rtl-a11y
---

# M5 — المساعد الذكي بالعربية، والأسعار والزحمة مع مصدرها

**الحالة:** لم تبدأ · **التقدير:** 3–4 ساعة · **يعتمد على:** [M2](M2-routing-navigation-satellite.md)، [M4](M4-messaging-inbox-notifications.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

يفتح المستخدم محادثة بالعربية من زر على الخريطة. المساعد:
- يفهم هدف الرحلة: سياحة، عمل، تسوق، أكل، إقامة.
- يسأل سؤالاً توضيحياً واحداً عند الغموض.
- يقترح 3 إلى 7 أماكن حقيقية من قاعدتنا، تظهر كبطاقات وعلى الخريطة.
- يذكر السعر والزحمة فقط إن توفّرا مع مصدرهما، وإلا يقول «لا تتوفر بيانات».
- يخطط يوماً من 3 إلى 5 أماكن بمسار.
- يجهّز مسودة طلب تُفتح في شاشة المراسلات، ولا تُرسل إلا بتأكيد المستخدم.
- يعمل ضمن حد يومي، مع تسجيل التكلفة.

وتعرض بطاقة المكان نطاق السعر وتقدير الزحمة، مع المصدر والتاريخ ودرجة الثقة، أو «لا تتوفر بيانات». ويستطيع المستخدم المسجّل الإبلاغ «مزدحم الآن» أو عن سعر.

## الميزات المطلوبة

- [ ] **وحدة insights**
  - كل قيمة Estimate<T> تحمل المصدر والتاريخ والثقة.
  - الأسعار من مصدرين:
    - المزوّد، عبر ProviderProfilePort وبموافقة show_prices.
    - بلاغات المستخدمين.
  - الزحمة:
    - تقدير heuristic حسب الفئة والساعة واليوم، بثقة منخفضة ومصدر «تقدير عام».
    - بلاغات «مزدحم الآن»، يتضاءل أثرها مع الوقت.
  - القيمة null عند غياب البيانات.
  - InsightsPort و CrowdingSource و PriceSource.
  - UserDataEraser للبلاغات.
- [ ] **وحدة assistant**
  - حلقة tool use على LlmClient، بالأدوات: search_places و place_details و price_range و crowding_estimate و plan_route و draft_inquiry.
  - فهم الهدف، وسؤال توضيحي واحد.
  - مدقق تأريض في الكود: يحذف أي مكان أو سعر أو زحمة لم يأتِ من نتيجة أداة، ثم يعيد التوليد مرة واحدة أو يرد بعدم توفر البيانات.
  - خطة اليوم: ترتيب بأقرب جار، ثم RoutingPort لكل مرحلة.
  - المسودة تُعاد فقط، ولا تُرسل.
  - الحد اليومي، وتسجيل الـ tokens والتكلفة لكل دورة.
  - تصفية الأرقام والبيانات الشخصية قبل الإرسال للنموذج.
  - نصوص الأماكن تُعامل كبيانات لا كتعليمات.
  - UserDataEraser.
- [ ] **محوّل Claude**
  - LlmClient فوق Anthropic SDK، من الخادم فقط.
  - النموذج من ASSISTANT_MODEL.
  - prompt caching للنظام والأدوات.
  - حساب التكلفة من usage.
  - إعادة المحاولة والمهلة.
  - البنّاء يقرأ skill ‏claude-api لأسماء النماذج والأسعار الحالية.
  - مشغّل evals حي اختياري يعمل فقط عند وجود المفتاح في البيئة.
- [ ] **evals عربية حتمية**
  - 30 سيناريو على الأقل تعمل على ScriptedLlmClient: الأهداف الخمسة، والغموض، وغياب البيانات، ومكان مهلوس، وحقن تعليمات عبر اسم مكان، وخطة اليوم.
  - تقيس: التأريض، وعدد الأماكن، والسؤال التوضيحي، وعدم الإرسال.
- [ ] **واجهة المساعد والأسعار والزحمة في البطاقة**
  - حزمة feature-assistant:
    - محادثة RTL، وبطاقات الأماكن، و«اعرض على الخريطة».
    - خطة اليوم مع رابط المعاينة.
    - المسودة: حوار تأكيد، ثم الانتقال إلى شاشة إنشاء الطلب بنصها وأماكنها.
    - رسالة الحد اليومي.
    - زر المساعد يظهر على الخريطة آلياً بعد تسجيل مساره.
  - قسم insights في البطاقة: القيمة مع المصدر والتاريخ والثقة، أو «لا تتوفر بيانات»، مع زرَّي الإبلاغ.

## خارج النطاق

- المحادثة الصوتية، وإرسال الصور للنموذج.
- الإرسال الآلي بلا تأكيد، والحجوزات.
- ذاكرة طويلة المدى، و streaming للردود.
- الزحمة من بيانات GPS.

## العقود

يجمّدها المكامل في commit `chore(M5): freeze contracts` قبل أن يبدأ أي بنّاء (القواعد في [سياسة العقود](README.md#سياسة-العقود)). المحتوى المطلوب:

The integrator freezes contracts in 30 min or less. It adds:
- insights router: GET /v1/places/:id/insights; POST /v1/insights/reports {kind crowded_now|price, value?}
- InsightsPort, CrowdingSource, PriceSource, and the PriceRange and CrowdLevel Estimate schemas
- assistant router: POST /v1/assistant/conversations; POST /v1/assistant/conversations/:id/messages returning AssistantReply {text, placeIds[], itinerary?, draftInquiry?, clarifyingQuestion?, remainingToday}; GET history
- the TripGoal enum
- the LlmClient port (messages, tools, usage)
- a zod input/output schema for every tool, converted to JSON Schema for the tool definitions
- AssistantDraftInquiry, equal to the M4 compose params
- fakes and conformance suites: ScriptedLlmClient (with a hallucinating script), FakeInsightsPort
- route links from the assistant to the map, navigation and compose
- testIDs
- env names: ANTHROPIC_API_KEY, ASSISTANT_MODEL, ASSISTANT_DAILY_LIMIT_PER_USER, ASSISTANT_LLM (anthropic|scripted)
- ownership front-matter

## توزيع الوكلاء

### البنّاؤون

يعملون بالتوازي كوكلاء في الخلفية، كلٌّ داخل مساراته فقط (انظر [البناء المتوازي](README.md#دورة-حياة-المرحلة)).

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-insights` | `modules/insights/**`<br>`mobile-features/map/**` | • وحدة insights مع conformance و UserDataEraser.<br>• قسم الأسعار والزحمة وزرّا الإبلاغ في البطاقة. |
| `builder-assistant` | `modules/assistant/**` | وحدة assistant:<br>• المحادثات، وحلقة الأدوات، وفهم الهدف.<br>• مدقق التأريض، وخطة اليوم، والمسودة.<br>• الحد اليومي، وتسجيل التكلفة، والتصفية.<br>• evals عربية حتمية.<br>• UserDataEraser. |
| `builder-llm-anthropic` | `adapters/llm-anthropic/**`<br>`tools/assistant-evals/**` | • محوّل LlmClient فوق Anthropic SDK (يقرأ skill ‏claude-api)، مع prompt caching والتكلفة وإعادة المحاولة.<br>• مشغّل evals حي يعمل فقط عند وجود المفتاح. |
| `builder-assistant-app` | `mobile-features/assistant/**` | حزمة feature-assistant:<br>• المحادثة والبطاقات.<br>• الانتقال إلى الخريطة والملاحة.<br>• تأكيد المسودة ثم الانتقال إلى الإنشاء.<br>• حالة الحد اليومي.<br>• اختبارات RNTL، وتدفق Maestro. |
| `builder-e2e-m5` | `e2e/**` | • سيناريوهات e2e/api للمساعد والتقديرات والبلاغات.<br>• وضع scripted LLM في الـ harness. |

### المكامل (integrator)

**يملك:** `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `turbo.json`، `.gitignore`، `.env.example`، `.gitleaks.toml`، `packages/tooling/**`، `packages/contracts/**`، `packages/testing/**`، `tools/ownership/**`، `apps/api/**`، `apps/mobile/*`، `apps/mobile/app/**`، `apps/mobile/src/shell/**`، `.github/workflows/ci.yml`، `.github/workflows/android.yml`، `docs/milestones/**`، `docs/adr/**`، `CLAUDE.md`

- ربط insights بـ ProviderProfilePort.
- ربط assistant بـ PlacesQueryPort و InsightsPort و RoutingPort.
- اختيار LlmClient (Anthropic أو scripted) حسب ASSISTANT_LLM.
- تسجيل UserDataEraser.
- مسار شاشة المساعد، فيظهر زرها على الخريطة.

### المدققون

لم يكتب أيٌّ منهم كود هذه المرحلة، ولا يعدّلون الكود؛ يرفعون الملاحظات لمالك الملف.

| الوكيل | العدسة | يفحص |
|---|---|---|
| `auditor-assistant-m5` | `assistant-evals (mandatory)` | • يشغّل evals بنفسه، ويضيف سيناريوهات عدائية: ضغط لاختراع سعر، وطلب إرسال مباشر، وحقن عبر اسم مكان.<br>• يتأكد أن التأريض في الكود لا في الـ prompt وحده.<br>• يتحقق من التوقف عند الحد، ومن معقولية التكلفة لكل محادثة. |
| `auditor-security-m5` | `security-privacy` | • المفتاح في الخادم فقط، ولا EXPO_PUBLIC سري.<br>• تصفية الأرقام والأسماء قبل الإرسال.<br>• المحادثات مفوّضة لصاحبها فقط.<br>• السجلات بلا محتوى شخصي.<br>• حد المعدّل على البلاغات. |
| `auditor-qa-m5` | `qa-build` | • تغطية evals للأهداف الخمسة وحالات الفشل (timeout، خطأ أداة).<br>• اختبارات insights.<br>• تدفق المحاكي وكل التدفقات السابقة لنفس الـ SHA.<br>• تسجيل حالة evals الحية. |
| `auditor-architecture-m5` | `architecture-contracts` | • المساعد يستهلك الـ ports فقط.<br>• مخططات الأدوات مشتقة من zod بلا تكرار.<br>• المحوّل معزول.<br>• مسار عرض الأسعار واحد.<br>• لا تعديل على messaging.<br>• نجاح knip و jscpd. |
| `auditor-rtl-m5` | `arabic-rtl-a11y` | • جودة العربية في نصوص الواجهة ورسالة «لا تتوفر بيانات».<br>• عرض الثقة بشكل مفهوم.<br>• فقاعات المحادثة والنص المختلط في RTL.<br>• قراءة البطاقات بقارئ الشاشة. |

## معايير القبول

| # | المعيار | طريقة التحقق |
|---|---|---|
| 1 | التقديرات تحمل دائماً المصدر والتاريخ والثقة ولا تُخترع | `pnpm --filter @iraq-maps/insights test`:<br>• price from the provider requires show_prices<br>• price from user reports: confidence grows with count and recency<br>• the crowding heuristic varies by category, hour and weekday<br>• crowded_now reports dominate for 60 minutes, then decay<br>• null when there is no data<br>• the InsightsPort conformance suite passes<br>• the UserDataEraser purges reports |
| 2 | المساعد مؤرَّض بالكامل في evals عربية حتمية | `pnpm --filter @iraq-maps/assistant test -- evals` with ScriptedLlmClient over 30 or more Arabic scenarios:<br>• ambiguous input gives exactly one clarifying question<br>• placeIds are always a subset of tool results<br>• 3 to 7 suggestions when the tools return at least 3<br>• a price or crowding mention without tool data gives «لا تتوفر بيانات»<br>• an injected hallucinated place is removed by the grounding validator<br>• an injection via a place name is ignored<br>• plan-a-day gives 3 to 5 ordered stops with legs from FakeRoutingPort |
| 3 | لا إرسال بدون تأكيد، ولا بيانات شخصية للنموذج، والحد والتكلفة مسجّلان | assistant tests:<br>• draft_inquiry never calls any send path (a spy over every messaging route)<br>• the captured LLM request payloads contain no phone numbers or user names<br>• the daily limit + 1 returns 429 with an Arabic message<br>• every turn writes a cost row with tokens and USD |
| 4 | محوّل Claude صحيح بدون مفتاح | `pnpm --filter @iraq-maps/adapter-llm-anthropic test`, using recorded fixtures:<br>• tools, system and model are mapped from ASSISTANT_MODEL<br>• tool_use parsing<br>• usage is converted to cost<br>• retry on 429 and 529 with backoff<br>• timeout<br>The live run `pnpm --filter @iraq-maps/assistant-evals live` is recorded as run or not run, depending on whether the user exported a key. |
| 5 | المساعد يعمل من البداية للنهاية عبر الخادم | `pnpm --filter @iraq-maps/e2e-api test -- assistant`: a conversation over the fixture DB returns real placeIds and a draft; an inquiry exists only after an explicit POST /v1/inquiries with confirm |
| 6 | شاشات المساعد وقسم الأسعار والزحمة تعمل | `pnpm --filter @iraq-maps/feature-assistant test`: cards, the show-on-map link, the itinerary preview link, draft confirmation leading to the compose link with params, and the limit state.<br>`pnpm --filter @iraq-maps/feature-map test`: insights with source, date and confidence; «لا تتوفر بيانات»; report crowded now. |
| 7 | المساعد يعمل على محاكي أندرويد | android.yml e2e job green, including mobile-features/assistant/maestro/suggest.yaml. The flow runs: ask «أريد مطعم عائلي قريب»; at least 3 cards appear; show on map; plan a day; draft; confirm; the compose screen opens prefilled.<br>The harness runs the API with the scripted LLM, which config refuses in production. All earlier flows also pass. |
| 8 | بوابة الجودة و CI وبناء أندرويد خضراء وموافقة المدققين ومنهم مدقق المساعد | `pnpm gate` exits 0; ci.yml and android.yml are green for the head SHA; the audit log shows every auditor APPROVED, including auditor-assistant-m5 |

## المتطلبات البيئية والبدائل المؤقتة

- ANTHROPIC_API_KEY is absent, so every gate uses ScriptedLlmClient. The live eval runs only if the user exports the key in env, never in the repo.
- ASSISTANT_MODEL is chosen by the user. The builder reads the claude-api skill for current model ids and prices.
- Insights heuristics need no external data.

**البدائل المؤقتة (mocks) في هذه المرحلة:** Anthropic API و `ASSISTANT_MODEL`، رابط API عام للتجربة على هاتف حقيقي، Valhalla (التوجيه)، Android SDK محلياً. التفاصيل وما يلزم للتشغيل الحقيقي في [MOCKS.md](MOCKS.md).

## بوابة الإغلاق

كل البنود على **نفس الـ SHA** (التفاصيل في [بوابة الإغلاق](README.md#بوابة-الإغلاق)):

- [ ] `pnpm infra:local up && pnpm install --frozen-lockfile && pnpm gate` ينجح من نسخة نظيفة
- [ ] `pnpm android:precheck` ينجح
- [ ] `ci.yml` ناجح
- [ ] `android.yml`: job ‏build ناجح (APK ‏arm64 ≤ 40MB ومرفوع كـ artifact)، و job ‏e2e ناجح (تدفقات Maestro لهذه المرحلة وكل ما قبلها)
- [ ] كل معايير القبول أعلاه مُثبتة بدليلها في «ما تم إنجازه»
- [ ] كل المدققين (5) سجّلوا `APPROVED <sha>` بلا ملاحظات حاجبة مفتوحة
- [ ] commit و push إلى `claude/iraq-smart-maps-app-aybpjn`، وتسجيل الـ SHA في الجدول أدناه، وتحديث الفهرس

## المخاطر

- بدون مفتاح حقيقي لا تُقاس جودة فهم اللهجة العراقية والكردية فعلياً.
- الهلوسة. نعالجها بمدقق تأريض حتمي، و evals، ومدقق مساعد إلزامي.
- التكلفة. نضبطها بحد يومي، و prompt caching، وتسجيل كل دورة.
- بيانات الأسعار والزحمة قليلة في البداية، فستظهر «لا تتوفر بيانات» كثيراً. هذا صحيح وصادق.

## ما تم إنجازه

لم تبدأ بعد.

| التاريخ | ما تم إنجازه | commit | ملاحظات التدقيق |
|---|---|---|---|
| | | | |
