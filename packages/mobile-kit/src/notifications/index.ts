export {
  NotificationPermissionManager,
  notificationPermissionManager,
  type PermissionStatus,
  type PermissionCheckResult,
  type PermissionManagerOptions,
} from './NotificationPermissionManager';

export {
  NotificationHandler,
  notificationHandler,
  type ReceivedNotification,
  type NotificationResponse,
  type PushNotificationData,
  type BannerPayload,
  type BannerOptions,
  type BannerDismissCallback,
  type TokenRegistrationApi,
  // New in this milestone: local scheduling helpers
  // (accessed via notificationHandler.scheduleLocalNotification / cancelLocalNotification)
} from './NotificationHandler';
