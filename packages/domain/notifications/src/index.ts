// Entities

export type {
  CustomMessagePayload,
  IncidentClosedPayload,
  IncidentOpenedPayload,
  Notification,
  NotificationKind,
  WrappedReportPayload,
} from "./entities/notification.ts"
export {
  customMessagePayloadSchema,
  groupOf,
  incidentClosedPayloadSchema,
  incidentOpenedPayloadSchema,
  NOTIFICATION_KIND_META,
  NOTIFICATION_KINDS,
  notificationKindSchema,
  notificationSchema,
  payloadSchemaFor,
  wrappedReportPayloadSchema,
} from "./entities/notification.ts"
export { shouldSendEmail } from "./entities/notification-preferences.ts"

// Helpers
export type { BuildIdempotencyKeyInput } from "./helpers/idempotency-key.ts"
export { buildIdempotencyKey } from "./helpers/idempotency-key.ts"
export type { ResolveRecipientsInput } from "./helpers/resolve-recipients.ts"
export { resolveRecipients } from "./helpers/resolve-recipients.ts"

// Ports
export type {
  GetUnreadNotificationCountInput as RepositoryGetUnreadNotificationCountInput,
  ListNotificationsInput as RepositoryListNotificationsInput,
  ListNotificationsResult,
  MarkAllNotificationsSeenInput as RepositoryMarkAllNotificationsSeenInput,
  MarkNotificationSeenInput as RepositoryMarkNotificationSeenInput,
  NotificationCursor,
  NotificationRepositoryShape,
} from "./ports/notification-repository.ts"
export { NotificationRepository } from "./ports/notification-repository.ts"

// Use cases
export type {
  CreateNotificationError,
  CreateNotificationInput,
  CreateNotificationResult,
} from "./use-cases/create-notification.ts"
export { createNotificationUseCase } from "./use-cases/create-notification.ts"
export type {
  DeleteNotificationsByProjectError,
  DeleteNotificationsByProjectInput,
} from "./use-cases/delete-notifications-by-project.ts"
export { deleteNotificationsByProjectUseCase } from "./use-cases/delete-notifications-by-project.ts"
export type {
  GetUnreadNotificationCountError,
  GetUnreadNotificationCountInput,
} from "./use-cases/get-unread-notification-count.ts"
export { getUnreadNotificationCountUseCase } from "./use-cases/get-unread-notification-count.ts"
export type { ListNotificationsError, ListNotificationsInput } from "./use-cases/list-notifications.ts"
export { listNotificationsUseCase } from "./use-cases/list-notifications.ts"
export type {
  MarkAllNotificationsSeenError,
  MarkAllNotificationsSeenInput,
} from "./use-cases/mark-all-notifications-seen.ts"
export { markAllNotificationsSeenUseCase } from "./use-cases/mark-all-notifications-seen.ts"
export type {
  MarkNotificationSeenError,
  MarkNotificationSeenInput,
} from "./use-cases/mark-notification-seen.ts"
export { markNotificationSeenUseCase } from "./use-cases/mark-notification-seen.ts"
export type {
  IncidentNotificationKind,
  IncidentNotificationRequest,
  RequestIncidentNotificationsError,
  RequestIncidentNotificationsInput,
  RequestIncidentNotificationsResult,
} from "./use-cases/request-incident-notifications.ts"
export { requestIncidentNotificationsUseCase } from "./use-cases/request-incident-notifications.ts"
export type {
  RequestWrappedReportNotificationsError,
  RequestWrappedReportNotificationsInput,
  RequestWrappedReportNotificationsResult,
  WrappedReportNotificationRequest,
} from "./use-cases/request-wrapped-report-notifications.ts"
export { requestWrappedReportNotificationsUseCase } from "./use-cases/request-wrapped-report-notifications.ts"
export type {
  NotificationEmailRecipient,
  NotificationEmailRenderer,
  NotificationEmailSender,
  RenderedEmailBoundary,
  RenderNotificationEmailError,
  SendNotificationEmailError,
  SendNotificationEmailInput,
  SendNotificationEmailTransportError,
} from "./use-cases/send-notification-email.ts"
export { sendNotificationEmailUseCase } from "./use-cases/send-notification-email.ts"
