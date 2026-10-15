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
/** @public haptic feedback helpers */
export { useHaptics } from './haptics';

export { useNetworkStatus } from './use-network-status';

/** @public feature-discovery tour overlay */
export { TourOverlay, shouldShowTour, TOUR_DONE_KEY, type TourStep } from './tour-overlay';

/** @public iPad/desktop keyboard shortcuts (no-op on phones) */
export { useKeyboardShortcuts } from './keyboard-shortcuts';

/** @public theme-aware color tokens */
export { useTheme, lightColors, darkColors, type ThemeColors } from './use-theme';

/** @public Dynamic Type / font scaling */
export { useFontScale, useFontScaleValue } from './font-scale';

/** @public home screen widget data */
export { WidgetDataService, readWidgetSnapshot, writeWidgetSnapshot, type WidgetSnapshot } from './widget-data';

/** @public mock crash reporter (logs in dev; swap for Sentry adapter in prod) */
export { crashReporter, type CrashSeverity } from './crash-reporter';
