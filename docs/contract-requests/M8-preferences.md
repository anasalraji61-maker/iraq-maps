# Contract request: user preferences endpoints

**Requestor:** identity builder (M8 settings/personalisation)
**Owned path:** `modules/identity/src/`

## Need

Two new routes on `meContract` to read and write user app preferences:

```
GET  /v1/me/preferences  → 200 UserPrefs
PATCH /v1/me/preferences → 200 UserPrefs  (body: partial UserPrefs)
```

`UserPrefs` is the zod schema exported from `modules/identity/src/preferences.ts`.

## Current workaround

A standalone NestJS `@Controller('v1/me/preferences')` in `modules/identity/src/http.ts`
serves these routes without ts-rest typesafety until the contract is updated.

## Requested change in `packages/contracts/src/http.ts`

```ts
import { UserPrefsSchema } from '../../modules/identity/src/preferences'; // or a re-export in packages/contracts

export const meContract = c.router({
  // existing…
  getPreferences:    { method: 'GET',   path: '/me/preferences', responses: { 200: UserPrefsSchema, 401: Problem } },
  updatePreferences: { method: 'PATCH', path: '/me/preferences', body: UserPrefsSchema, responses: { 200: UserPrefsSchema, 400: Problem, 401: Problem } },
}, { pathPrefix: '/v1', strictStatusCodes: true });
```

Or, alternatively, move `UserPrefsSchema` to `packages/contracts/src/preferences.ts` and
export it from the contracts index so the module does not need to be imported by contracts.
