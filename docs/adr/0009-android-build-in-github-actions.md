# ADR-0009: بناء أندرويد في GitHub Actions بلا EAS

**الحالة:** مقبول · **التاريخ:** 2026-10-08

## السياق

- بوابة الإغلاق تتطلب بناء أندرويد ناجحاً لكل مرحلة.
- Android SDK لا يُثبَّت في بيئة الوكلاء، لأن dl.google.com محجوب.
- EAS Build غير متاح: api.expo.dev محجوب، ولا يوجد `EXPO_TOKEN`.
- runners ‏`ubuntu-latest` في GitHub فيها Android SDK و NDK و KVM مثبتة مسبقاً.
- رمز gh CLI غير صالح، لكن أدوات GitHub MCP تقرأ التشغيلات والسجلات.

## القرار

- البوابة هي `.github/workflows/android.yml`، وتعمل عند push إلى `claude/iraq-smart-maps-app-aybpjn`.
- job ‏build: ‏CNG عبر `expo prebuild -p android --clean --no-install` (مجلد `apps/mobile/android` مستثنى من git)، ثم `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a` موقّعاً بمفتاح debug القالب، فيُضمَّن JavaScript عبر Metro و Hermes. يفشل إن زاد حجم APK عن 40MB، ويرفع APK كـ **Actions artifact**، ويكتب تعليقات `::error` عند الفشل. صلاحيات الرمز `contents: read`، ولا أسرار، ولا GitHub Releases.
- job ‏e2e: APK ‏x86_64، وخادم داخل الـ job على حاويتي postgis و redis ببيانات fixture، ومحاكي API 34 ‏(google_apis، x86_64)، وتدفقات Maestro بـ testIDs. *(عُدِّل 2026-10-08: كان API 30 في الخطة، والمنفَّذ والمُتحقَّق منه في CI هو API 34. أجهزة 3GB وأندرويد 8 تُختبر في M7 بمحاكي API 26.)*
- فحص محلي إلزامي قبل كل push: `pnpm android:precheck` (`expo prebuild --no-install` و `expo export -p android`) بلا SDK.
- النتائج تُقرأ لنفس الـ SHA عبر GitHub MCP (`actions_list`، `actions_get`، `get_job_logs`).

## البدائل المرفوضة

- **EAS Build:** محجوب ولا رمز.
- **بناء محلي بـ SDK:** محجوب. إن سمح المستخدم بـ dl.google.com يصبح `pnpm android:build` تسريعاً محلياً فقط، وتبقى Actions المرجع.
- **`assembleDebug`:** لا يضمّن JavaScript، فلا يكشف الاستيرادات المكسورة.
- **حفظ مجلد `android/` في git:** ينحرف عن `app.config` ويصعب صيانته.
- **نشر APK في GitHub Release:** مرفوض بقرار القائد؛ الـ artifact يكفي للتنزيل والتجربة.

## العواقب

- دورة CI تستغرق 15 إلى 25 دقيقة، فتُجمَّع الإصلاحات ويُشغَّل الفحص المحلي قبل كل push.
- تتطلب البوابة أن تكون Actions مفعّلة بصلاحيات read and write للـ workflows، وأن يسمح رمز الجلسة بدفع `.github/workflows/*`. تجربة الدفع في بداية M0 تحسم ذلك.
- الـ APK موقّع بمفتاح debug وليس للنشر. الرفع إلى Google Play يحتاج لاحقاً مفتاح رفع يوفّره المستخدم خارج المستودع.
- تجربة المستخدم على هاتفه تكون بتنزيل الـ artifact من صفحة التشغيل.
