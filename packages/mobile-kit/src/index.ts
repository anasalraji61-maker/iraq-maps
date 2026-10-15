/** @public frozen session types */
export type { Session, SessionState } from './context';
/** @public the frozen MVP route map and its param types */
export { AvailableRoutesProvider, href, routes, useRouteAvailable, type RouteName, type RouteParams } from './routes';
export { SessionProvider, useApi, useApiBaseUrl, useSession } from './session';
/** @public frozen stub (M2) */
export { recentRoutes, type RecentRoute } from './recent-routes';
/** @public frozen stub (M3) */
export { uploadAsset } from './upload-asset';
/** @public offline inquiry outbox (M4) */
export { InquiryOutbox, type OutboxEntry } from './outbox';
/** @public shared request helpers */
export { expectStatus, ProblemError, useRequest } from './request';

export { savedPlaces, type SavedPlace } from './saved-places';
/** @public app-rating prompt: call after user creates a post or sends a message */
export { useAppRating } from './app-rating';
/** @public offline action queue: persist and retry failed actions on reconnect */
export {
  enqueueOfflineAction,
  dequeueOfflineAction,
  useOfflineQueueDrain,
  type QueuedAction,
} from './offline-queue';
/** @public error boundary with optional ErrorReporter integration */
export { ErrorBoundary } from './error-boundary';
