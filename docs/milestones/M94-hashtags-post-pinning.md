---
id: M94
slug: hashtags-post-pinning
status: in_progress
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-discover:
    - "mobile-features/discover/**"
  integrator:
    - "docs/milestones/**"
auditors:
  auditor-qa-m94: qa-build
---

# M94 — Hashtags in posts + Post pinning

**الحالة:** قيد التنفيذ · **التقدير:** 2 ساعة · **يعتمد على:** [M93](M93-verified-badge.md) · **الفرع:** `claude/iraq-smart-maps-app-aybpjn`

## الهدف

يرى المستخدم الوسوم (#hashtag) في نص المنشور كروابط قابلة للنقر، وعند نقره على وسم يُفلتر الفيد بمنشورات تحمل نفس الوسم. يستطيع صاحب المنشور تثبيت منشور واحد في أعلى صفحة منشوراته.

## الميزات المطلوبة

- [x] **تحليل الوسوم:** دالة تستخرج #hashtag من نص المنشور وتعيد أجزاء نصية عادية + روابط
- [x] **وسوم قابلة للنقر:** في PostCard و PostDetailScreen يظهر #hashtag بلون أزرق وقابل للضغط
- [x] **فلترة الفيد بالوسم:** عند ضغط وسم يفتح HashtagFeedScreen يعرض منشورات تحتوي ذلك الوسم عبر searchPosts
- [x] **تثبيت المنشور:** زر "تثبيت/إلغاء تثبيت" في قائمة خيارات المنشور (المالك فقط)، يُخزَّن محلياً في AsyncStorage، يظهر المنشور المثبت أولاً في UserPostsScreen

## خارج النطاق

- تثبيت من جانب الخادم (يحتاج migration)
- اقتراحات وسوم أثناء الكتابة

## العقود

بدون تغييرات على `packages/contracts` — نستخدم `searchPosts` الموجود مع query = `#hashtag`.
