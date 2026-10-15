# Contract Request: Provider Response to Reviews

**Requesting builder:** mobile-features/provider  
**Filed:** 2026-10-15

## Gap

The `reviewsContract` in `packages/contracts/src/places.ts` has no endpoint for
a provider to publicly respond to a user review.

`ProviderReviewResponseScreen` currently persists responses locally (AsyncStorage)
as a stopgap. Once this endpoint exists, replace the local write/read.

## Requested addition to `reviewsContract`

```ts
respondToReview: {
  method: 'POST',
  path: '/places/:placeId/reviews/:reviewId/response',
  pathParams: z.object({
    placeId: PlaceId,
    reviewId: ReviewId,
  }),
  body: z.object({ text: z.string().min(1).max(500) }),
  responses: {
    200: z.object({ text: z.string(), updatedAt: z.string().datetime() }),
    400: z.object({ code: z.string() }),
    401: z.object({ code: z.literal('unauthenticated') }),
    403: z.object({ code: z.literal('not_place_provider') }),
    404: z.object({ code: z.literal('not_found') }),
  },
  summary: "Provider posts or updates a public response to a review on their place",
},

deleteResponse: {
  method: 'DELETE',
  path: '/places/:placeId/reviews/:reviewId/response',
  pathParams: z.object({ placeId: PlaceId, reviewId: ReviewId }),
  body: z.object({}),
  responses: {
    200: z.object({ ok: z.literal(true) }),
    403: z.object({ code: z.literal('not_place_provider') }),
    404: z.object({ code: z.literal('not_found') }),
  },
  summary: "Provider deletes their response to a review",
},
```

Also extend the `Review` schema to include:
```ts
ownerResponse: z.object({ text: z.string(), updatedAt: z.string().datetime() }).nullable().optional(),
```

## Consumer

`mobile-features/provider/src/screens/ProviderReviewResponseScreen.tsx`
