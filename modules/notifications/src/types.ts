import type { AuthPrincipal } from '@iraq-maps/contracts';

export interface AuthenticatedRequest {
  principal: AuthPrincipal;
}
