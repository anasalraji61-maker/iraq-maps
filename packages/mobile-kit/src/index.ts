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
/** @public composite offline state hook */
export { useOffline, type UseOfflineReturn } from './hooks/useOffline';
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

/** @public WebSocket hook with exponential backoff reconnection */
export { useWebSocket, type WsStatus, type WsIncomingEvent, type UseWebSocketOptions, type UseWebSocketReturn } from './use-websocket';

/** @public WebSocket connection status indicator dot */
export { WsStatusIndicator, type WsStatusIndicatorProps } from './ws-status-indicator';

/** @public unified accessibility hook (screen reader, font scale, contrast, reduce motion) */
export { useAccessibility, type AccessibilityState } from './hooks/useAccessibility';

/** @public realtime WebSocket singleton manager */
export {
  RealtimeManager,
  type ConnectionState,
  type RealtimeEvent,
  type RealtimeEventType,
  type RealtimeHandler,
  type ConnectionStateHandler,
  type UnsubscribeFn,
} from './websocket/RealtimeManager';

/** @public real-time messages hook */
export {
  useRealtimeMessages,
  type Message,
  type MessageStatus,
  type MessageType,
  type UseRealtimeMessagesOptions,
  type UseRealtimeMessagesReturn,
} from './hooks/useRealtimeMessages';

/** @public real-time notifications hook */
export {
  useRealtimeNotifications,
  type Notification,
  type NotificationType,
  type UseRealtimeNotificationsOptions,
  type UseRealtimeNotificationsReturn,
} from './hooks/useRealtimeNotifications';

/** @public online/offline status hook */
export {
  useOnlineStatus,
  type UseOnlineStatusReturn,
  type UseOnlineStatusOptions,
} from './hooks/useOnlineStatus';

/** @public push notification permission manager and handler */
export {
  NotificationPermissionManager,
  notificationPermissionManager,
  type PermissionStatus,
  type PermissionCheckResult,
  type PermissionManagerOptions,
  NotificationHandler,
  notificationHandler,
  type ReceivedNotification,
  type NotificationResponse,
  type PushNotificationData,
  type BannerPayload,
  type BannerOptions,
  type BannerDismissCallback,
  type TokenRegistrationApi,
} from './notifications';

/** @public deep link parsing, building and dispatch */
export {
  DeepLinkManager,
  deepLinkManager,
  DEEP_LINK_SCHEME,
  DEEP_LINK_WEB_HOST,
  DEEP_LINK_MAX_LENGTH,
  DEEP_LINK_MAX_PARAM_LENGTH,
  isValidId,
  isValidQuery,
  isValidLatLng,
  isValidMode,
  isValidPlaceTab,
  isValidProviderSection,
  DEEP_LINK_SCREEN_MAP,
  type DeepLinkHandler,
  type ParseResult,
  type DeepLinkType,
  type DeepLinkParams,
  type PlaceDeepLinkParams,
  type PostDeepLinkParams,
  type UserDeepLinkParams,
  type ProviderDeepLinkParams,
  type RouteDeepLinkParams,
  type SearchDeepLinkParams,
  type EventDeepLinkParams,
  type Tour3DDeepLinkParams,
  type OgResourceType,
} from './deeplink';

/** @public media helpers: image picker, video player, photo gallery */
export {
  pickImages,
  pickSingleImage,
  pickMultipleImages,
  reprocessImage,
  validateImageSize,
  requestCameraPermission,
  requestMediaLibraryPermission,
  checkPermissions,
  MAX_PHOTOS,
  MAX_BYTES,
  TARGET_BYTES,
  type PickedImage,
  type PickSource,
  type PickOptions,
  type PickResult,
  type PermissionResult,
} from './media/ImagePicker';
export { VideoPlayer, type PlaybackState, type PlaybackRate, type VideoPlayerOptions } from './media/VideoPlayer';
export { PhotoGallery, type GalleryPhoto, type PhotoGalleryProps } from './media/PhotoGallery';

/** @public accessibility manager: screen reader, contrast, font scale */
export { AccessibilityManager, type A11yState, type A11yListener } from './accessibility/AccessibilityManager';

/** @public accessibility wrapper component */
export {
  AccessibilityWrapper,
  type AccessibilityWrapperProps,
  type WrapperRole,
} from './accessibility/AccessibilityWrapper';

/** @public form accessibility helpers */
export {
  textFieldProps,
  searchFieldProps,
  passwordFieldProps,
  buttonProps,
  checkboxProps,
  radioProps,
  switchProps,
  sliderProps,
  pickerProps,
  groupProps,
  errorLabel,
  buildLabel,
  type FieldConfig,
  type FieldGroup,
  type FormFieldProps,
} from './accessibility/FormAccessibility';

/** @public share utilities and branded share card */
export {
  ShareManager,
  shareManager,
  ShareCard,
  type ShareCardLabels,
  type SharePayload,
  type SharePlaceInput,
  type SharePostInput,
  type ShareRouteInput,
  type ShareEventInput,
  type ShareProfileInput,
  type ShareCardData,
  type ShareCardProps,
} from './sharing';
