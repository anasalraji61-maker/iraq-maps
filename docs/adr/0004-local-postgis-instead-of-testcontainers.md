# ADR-0004: قواعد الاختبار على PostGIS محلي بدل Testcontainers

**الحالة:** مقبول · **التاريخ:** 2026-10-08

## السياق

- `docs/ARCHITECTURE.md` نصّ على Testcontainers لاختبارات Postgres الحقيقية.
- Docker غير قابل للاستخدام في بيئة الوكلاء: لا daemon، و Docker Hub محجوب. فلا Testcontainers ولا MinIO محلياً.
- في البيئة PostgreSQL 16.15 مع postgis 3.4.2 و pg_trgm، و redis-server.
- الاختبارات يجب أن تعمل على PostGIS حقيقي (الاستعلامات المكانية والبحث بـ pg_trgm لا تُحاكى).

## القرار

- `packages/db-kit` يوفّر `createTestDatabase()`: ينسخ قاعدة قالب فيها امتدادا postgis و pg_trgm إلى قاعدة معزولة لكل ملف اختبار، على Postgres 16 المحلي.
- `pnpm infra:local up/down` يشغّل Postgres و Redis المحليين بلا Docker (`pg_ctlcluster 16 main start` و `redis-server --daemonize yes`)، ويبقى docker-compose متاحاً لأجهزة المطوّرين.
- في CI، `ci.yml` و job ‏e2e في `android.yml` يستخدمان حاويتي خدمة `postgis/postgis:16-3.4` و `redis`، بنفس إصدارات البيئة المحلية.
- لا MinIO: محوّل S3 يُختبر ضد خادم S3 HTTP وهمي، والتطوير والاختبار يستخدمان محرّك تخزين على نظام الملفات (انظر [`MOCKS.md`](../milestones/MOCKS.md)).

## البدائل المرفوضة

- **Testcontainers:** لا يعمل بلا Docker هنا.
- **pg-mem أو SQLite:** بلا PostGIS ولا pg_trgm، فلا يختبر السلوك الحقيقي.
- **قاعدة مشتركة واحدة بلا عزل:** اختبارات متداخلة وغير مستقرة عند التوازي.

## العواقب

- نسخ القالب سريع، وكل ملف اختبار معزول، والاختبارات تعمل بالتوازي.
- الاختبارات تتطلب `pnpm infra:local up` قبل `pnpm gate`، وهذا جزء من أمر البوابة.
- يجب أن تبقى إصدارات Postgres و PostGIS متطابقة بين البيئة المحلية و CI.
- يُحدَّث جدول الاختبارات في `docs/ARCHITECTURE.md` ليذكر PostGIS المحلي بدل Testcontainers.
