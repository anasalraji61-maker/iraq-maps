# ADR-0007: حذف الحساب عبر UserDataEraser، و outbox مشترك في schema ‏platform

**الحالة:** مقبول · **التاريخ:** 2026-10-08

## السياق

- كل وحدة تملك schema خاصاً بها، ولا تستورد وحدة أخرى (قواعد depcruise). التواصل بينها عبر منافذ `packages/contracts` وأحداث الـ outbox فقط.
- حذف الحساب (`DELETE /v1/me`) يجب أن يزيل بيانات المستخدم من كل وحدة تخزنها، لا من identity وحدها.
- الحدث الذي يُكتب ثم يُنشر بخطوتين منفصلتين قد يضيع إذا توقفت العملية بينهما.

## القرار

### الحذف عبر UserDataEraser

- المنفذ `UserDataEraser { module, erase(userId) }` في `packages/contracts`. كل وحدة تخزن بيانات مستخدم تنفّذه، و `apps/api` يربط القائمة ويمررها إلى identity (`erasers`).
- **idempotent:** استدعاء `erase` لمستخدم بلا بيانات، أو استدعاؤه مرتين، ينجح بلا خطأ. كل تنفيذ يجتاز `userDataEraserConformance` من `packages/testing`.
- **الترتيب:** identity يستدعي كل eraser بالتتابع أولاً. بعدها، في transaction واحدة، يحذف صفوفه ويكتب `identity.user.deleted.v1` إلى الـ outbox.
- **لا ذرّية بين الوحدات:** كل eraser يلتزم في schema وحدته. إذا فشل أحدها بقي ما حذفه من سبقه محذوفاً.
- **عند الفشل:** يبقى الحساب (صفوف identity) كما هو، ويتلقى العميل 500، ويمكنه إعادة `DELETE /v1/me`. لأن كل eraser ‏idempotent، تكمل الإعادة ما بقي.
- الحدث `identity.user.deleted.v1` للبيانات المشتقة (فهارس، caches)، وليس بديلاً عن eraser: الـ erasers تنتهي قبل أن يُحذف الحساب.

### outbox مشترك: `platform.outbox`

- جدول واحد `platform.outbox` في schema ‏`platform`، تملكه `packages/db-kit`. migrations الخاصة به (`platformMigrationsDir`) تعمل قبل migrations أي وحدة، في `pnpm --filter @iraq-maps/api migrate` وفي `createTestDatabase`.
- `platform` هو الاستثناء الوحيد من قاعدة «كل وحدة تملك schema». فحص الحدود في `runModuleMigrations` يمنع أي migration لوحدة من لمس `platform`.
- الوحدات تكتب فيه فقط عبر `createOutboxPublisher(db).publish(event, tx)` داخل transaction الوحدة نفسها، ولا تكتب SQL مباشرة.
- relay واحد (`startOutboxRelay`) في `apps/api` ينشر الأحداث بترتيب `seq` إلى EventBus داخل العملية. كل صف يُسلَّم مرة واحدة: يُحجز بـ `FOR UPDATE SKIP LOCKED`، ويُعلَّم `published_at` في الـ transaction نفسها.
- هدف BullMQ موجود في db-kit، لكن `apps/api` لا يربطه حتى يوجد مستهلك.

## البدائل المرفوضة

- **outbox لكل وحدة في schema خاص بها:** يحتاج relay لكل وحدة، أو relay يعرف كل الـ schemas.
- **saga أو 2PC بين الوحدات للحذف:** ثقيل. الإعادة مع erasers ‏idempotent تكفي.
- **الحذف عبر الحدث وحده (غير متزامن):** يتلقى العميل 204 قبل أن تُحذف البيانات، ولا يرى الفشل.

## العواقب

- كل وحدة جديدة تخزن بيانات مستخدم يجب أن توفّر eraser يجتاز الـ conformance، ويربطه `apps/api`. هذا بند في مراجعة كل مرحلة.
- بين محاولة فاشلة وإعادتها قد يكون الحذف جزئياً. الحساب يبقى صالحاً حتى تنجح الإعادة.
- الأحداث تُسلَّم بالترتيب. حدث يفشل تسليمه يوقف ما بعده حتى ينجح.
