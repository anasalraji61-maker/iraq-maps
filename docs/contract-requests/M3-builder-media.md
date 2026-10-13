# M3 builder-media contract requests

## Env vars needed (add to .env.example if missing)

The following env vars are required by modules/media and adapters/storage-s3.
Checked: `grep S3_ /home/claude/iraq-maps/.env.example` confirmed S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY already exist.

Additional vars needed:

```
MEDIA_SIGNING_SECRET=   # HMAC secret for FileObjectStorage signed URLs (dev/test)
S3_REGION=              # AWS/R2 region (default: auto for R2)
```

## Outbox: media.asset.processing.v1

The service emits `media.asset.processing.v1` from completeUpload.
This event name is not currently in `packages/contracts/src/events.ts` under `eventPayloads`.
It is used as an internal signal only (worker picks it up to call processAsset).
If the integrator wants it in the registry, add to `mediaEventPayloads`:
```ts
'media.asset.processing.v1': z.object({ assetId: AssetId, ownerId: UserId, purpose: MediaPurpose }),
```

## PortTokens.ObjectStorage

`packages/contracts/src/ports.ts` already declares `ObjectStorage: 'port:ObjectStorage'` (M3).
No change needed.

## apps/api wiring

apps/api must import `mediaModule({ db, storage })` and register it.
The storage provider: use `createS3StorageFromEnv()` from `@iraq-maps/adapter-storage-s3`;
fall back to `new FileObjectStorage()` if it returns null.
