# Contract Request: Photo attachments on place reviews

**Filed by:** M98 builder  
**Milestone:** M98

## Request

Add optional photo attachments to the place review submit body and the `Review` type.

### Changes needed in `packages/contracts/src/places.ts`

1. **`reviewsContract.submit` body** — add `mediaAssetIds` field:
   ```ts
   body: z.object({
     rating: z.number().int().min(1).max(5),
     text: z.string().max(500).optional(),
     mediaAssetIds: z.array(AssetId).max(4).optional(),
   })
   ```

2. **`Review` type** — add photos field:
   ```ts
   export const Review = z.object({
     id: ReviewId,
     placeId: PlaceId,
     userId: UserId,
     rating: z.number().int().min(1).max(5),
     text: z.string().optional(),
     photos: z.array(z.object({ assetId: AssetId, url: SignedUrlString })).optional(),
     createdAt: z.string().datetime(),
   });
   ```

3. **`MediaPurpose`** in `packages/contracts/src/media.ts` — add `place_review_photo`:
   ```ts
   export const MediaPurpose = z.enum(['provider_photo', 'provider_logo', 'place_review_photo']);
   ```

## Rationale

M98 lets users attach up to 4 photos when writing a place review (M98 feature: "Place photos from users"). The mobile UI is implemented and uploads photos via the existing `uploadAsset` helper, storing `assetId`s locally. The submit call needs to carry those IDs to the backend so they persist and appear for all users.

Until this contract change is merged, photo IDs are stored in local component state and shown only to the reviewing user in the same session (optimistic display).
