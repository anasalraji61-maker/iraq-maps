# Contract Request — M4 builder-messages-app

**File:** `packages/contracts/src/http.ts`

## Change needed

Add `messagingContract` to `apiContract`:

```typescript
import { messagingContract } from './messaging';

export const apiContract = c.router({
  // ... existing routes ...
  messaging: messagingContract,  // M4
});
```

## Reason

`feature-messages` screens call `api.messaging.createInquiry`, `api.messaging.listInquiries`, and `api.messaging.getInquiry` through the typed API client. Without this addition, the client has no `messaging` property.

## Unblock workaround

Until the integrator applies this, `feature-messages` creates a standalone ts-rest client for messaging using `initClient(messagingContract, ...)` and the base URL from `useApiBaseUrl()`.
