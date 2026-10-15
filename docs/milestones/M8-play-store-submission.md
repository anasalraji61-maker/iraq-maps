---
id: M8
slug: play-store-submission
status: in_progress
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-signing:
    - "apps/mobile/android/app/build.gradle"
    - "apps/mobile/app.config.ts"
    - "apps/mobile/eas.json"
    - "scripts/**"
    - "e2e/mobile/build-apk.sh"
  builder-store-listing:
    - "store/**"
    - "docs/store/**"
    - "site/**"
  builder-data-safety:
    - "docs/play/**"
  integrator:
    - "package.json"
    - "pnpm-workspace.yaml"
    - "pnpm-lock.yaml"
    - "turbo.json"
    - ".gitignore"
    - ".env.example"
    - "docs/milestones/**"
    - "docs/adr/**"
    - "CLAUDE.md"
    - "docs/ARCHITECTURE.md"
    - ".github/workflows/android.yml"
auditors:
  auditor-security-m8: security-privacy
  auditor-qa-m8: qa-build
---

# M8 — تجهيز نشر Google Play

**الحالة:** قيد التنفيذ · **التقدير:** 2–3 ساعة · **يعتمد على:** [M7](M7-ops-privacy-budgets-rc.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

> العملية العامة (التجميد، البناء المتوازي، التكامل، التدقيق، الإغلاق) في [README.md](README.md) ولا تتكرر هنا. هذا الملف يحدد ما يخص المرحلة فقط.

## الهدف

رفع نسخة تجريبية (internal test track) قابلة للتثبيت على هاتف حقيقي عبر Google Play، مع استيفاء كل متطلبات السياسة الإلزامية.

## الميزات المطلوبة

- [ ] **توقيع APK/AAB بمفتاح إصدار حقيقي**
  - keystore مشفّر مخزَّن كـ GitHub Secret (لا يُكتب في الريبو أبداً)
  - `android.yml` يوقّع في وضع `release` بمفتاح الإصدار عند `KEYSTORE_BASE64` موجود، وإلا بـ debug
  - `eas.json` يحدد `submit.production` profile (بلا EAS build: البناء محلي في Actions)

- [ ] **تهيئة App Bundle (AAB) وتقليص الحجم**
  - توليد AAB بدل APK في الإصدار النهائي: `./gradlew :app:bundleRelease`
  - تأكيد حجم AAB ≤ 40 MB في ملخص job الـ CI
  - R8/ProGuard مفعّل بـ `minifyEnabled true` في `build.gradle` لـ release

- [ ] **بيان سياسة البيانات (Data Safety Form)**
  - ملف `docs/play/data-safety.md` يوثّق كل نوع بيانات يُجمَّع أو يُشارَك وفق تصنيف Play
  - يغطي: الهاتف (للتسجيل، مطلوب)، الموقع (اختياري، للبحث والملاحة)، الصور (اختياري، لوضع المزوّد)، FCM token (للإشعارات)
  - يؤكد عدم مشاركة البيانات مع أطراف ثالثة إلا عبر الـ API (Anthropic للمساعد، WhatsApp للتسليم)

- [ ] **إدراج المتجر (Store Listing)**
  - `docs/store/short-description.ar.txt` (80 حرفاً)
  - `docs/store/full-description.ar.txt` (4000 حرفاً)
  - `docs/store/short-description.en.txt` و `full-description.en.txt` للمراجعين
  - نقاط البيع الرئيسية: خريطة بغداد بالعربية، بحث وملاحة، مساعد ذكي، تواصل مع الأعمال

- [ ] **لقطات شاشة المتجر**
  - 4 لقطات من Maestro e2e (الخريطة، البحث، المساعد، المراسلة) بحجم 1080×1920
  - رمز التطبيق (icon) ولافتة الميزات (feature graphic) 1024×500 — أماكن شاغرة (placeholder) مقبولة للـ internal track
  - سكريبت `scripts/store-assets.sh` ينسخ من مخرجات Maestro إلى `store/screenshots/`

- [ ] **تهيئة تصنيف المحتوى (Content Rating)**
  - إتمام استبيان IARC: لا عنف، لا محتوى بالغ، تطبيق خرائط واجتماعي عام
  - توثيق الإجابات في `docs/play/content-rating.md`

- [ ] **سياسة الحذف (Account Deletion)**
  - رابط حذف الحساب (`account.deleteAccount`) متاح داخل التطبيق ✓ (M7)
  - URL خارجي لصفحة حذف الحساب في Play Console: يشير إلى `https://iraqmaps.iq/delete-account`
  - صفحة بسيطة في `site/delete-account/index.html` تشرح خطوات الحذف (مطلوبة بسياسة Play)

## خارج النطاق

- حساب Google Play Developer (يحتاج المستخدم): التحضير يسبق الرفع.
- ASO المتقدم (A/B testing للأوصاف): مرحلة لاحقة.
- نشر لـ production track: يبدأ بعد مراجعة Google وفي عهدة المستخدم.
- توطين المتجر لـ كردي سوراني: لاحقاً.

## توزيع الوكلاء

### البنّاؤون

| الوكيل | يملك حصرياً | يسلّم |
|---|---|---|
| `builder-signing` | `apps/mobile/eas.json`، `apps/mobile/app.config.ts` (signing section)، `.github/workflows/android.yml` (signing step) | AAB يُبنى ويُوقَّع في CI |
| `builder-store-listing` | `store/**`، `docs/store/**`، `site/delete-account/**` | نصوص إدراج المتجر، صفحة حذف الحساب |
| `builder-data-safety` | `docs/play/**` | بيان البيانات، تصنيف المحتوى |

### المكامل (integrator)

**يملك:** `.github/workflows/android.yml` (القسم العام)، `package.json`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، ملفات الوثائق المشتركة.

## معايير القبول

| # | المعيار | الدليل |
|---|---|---|
| AC-1 | AAB ≤ 40 MB موقَّع بمفتاح release أو debug | حجم artifact في ملخص job `android.yml` |
| AC-2 | R8 مفعَّل في release build | `minifyEnabled true` في `build.gradle` |
| AC-3 | بيان البيانات موثَّق ومراجَع | `docs/play/data-safety.md` موجود وكامل |
| AC-4 | نصوص المتجر بالعربية والإنجليزية | ملفات `docs/store/*.txt` موجودة |
| AC-5 | صفحة حذف الحساب | `site/delete-account/index.html` موجود |
| AC-6 | لا أسرار في الريبو | `pnpm gitleaks` نظيف |
| AC-7 | `pnpm gate` ناجح على SHA الإغلاق | مخرجات gate |

## ما تم إنجازه

*(يُملأ عند الإغلاق)*
