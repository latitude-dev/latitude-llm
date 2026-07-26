// Entities

export type {
  BillingLimitReachedPayload,
  CustomMessagePayload,
  DestinationQuarantinedPayload,
  IncidentBreach,
  IncidentClosedPayload,
  IncidentEventPayload,
  IncidentOpenedPayload,
  IncidentRecovery,
  IncidentSampleAuthor,
  IncidentSampleExcerpt,
  IncidentTrend,
  IncidentTrendMarker,
  Notification,
  NotificationKind,
  SignalAssignedPayload,
  SignalDiscoveredPayload,
  SignalRegressedPayload,
  WrappedReportPayload,
} from "./entities/notification.ts"
export {
  billingLimitReachedPayloadSchema,
  customMessagePayloadSchema,
  destinationQuarantinedPayloadSchema,
  groupOf,
  incidentBreachSchema,
  incidentClosedPayloadSchema,
  incidentEventPayloadSchema,
  incidentOpenedPayloadSchema,
  incidentRecoverySchema,
  incidentSampleExcerptSchema,
  incidentTagsSchema,
  incidentTrendPointSchema,
  incidentTrendSchema,
  NOTIFICATION_KIND_META,
  NOTIFICATION_KINDS,
  notificationKindSchema,
  notificationSchema,
  payloadSchemaFor,
  signalAssignedPayloadSchema,
  signalDiscoveredPayloadSchema,
  signalRegressedPayloadSchema,
  wrappedReportPayloadSchema,
} from "./entities/notification.ts"
export { shouldSendEmail } from "./entities/notification-preferences.ts"

// Helpers
export type { BuildIdempotencyKeyInput } from "./helpers/idempotency-key.ts"
export { buildIdempotencyKey } from "./helpers/idempotency-key.ts"
export type { ResolveAdminRecipientsInput } from "./helpers/resolve-admin-recipients.ts"
export { resolveAdminRecipients } from "./helpers/resolve-admin-recipients.ts"
export type { ResolveRecipientsInput } from "./helpers/resolve-recipients.ts"
export { resolveRecipients } from "./helpers/resolve-recipients.ts"

// Ports
export type { IncidentMonitorInfo, IncidentMonitorReaderShape } from "./ports/incident-monitor-reader.ts"
export { IncidentMonitorReader } from "./ports/incident-monitor-reader.ts"
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
  BillingLimitNotificationRequest,
  RequestBillingLimitNotificationsError,
  RequestBillingLimitNotificationsInput,
  RequestBillingLimitNotificationsResult,
} from "./use-cases/request-billing-limit-notifications.ts"
export { requestBillingLimitNotificationsUseCase } from "./use-cases/request-billing-limit-notifications.ts"
export type {
  DestinationQuarantinedNotificationRequest,
  RequestDestinationQuarantinedNotificationsError,
  RequestDestinationQuarantinedNotificationsInput,
  RequestDestinationQuarantinedNotificationsResult,
} from "./use-cases/request-destination-quarantined-notifications.ts"
export { requestDestinationQuarantinedNotificationsUseCase } from "./use-cases/request-destination-quarantined-notifications.ts"
export type {
  IncidentNotificationKind,
  IncidentNotificationRequest,
  IncidentTransition,
  RequestIncidentNotificationsError,
  RequestIncidentNotificationsInput,
  RequestIncidentNotificationsResult,
} from "./use-cases/request-incident-notifications.ts"
export { requestIncidentNotificationsUseCase } from "./use-cases/request-incident-notifications.ts"
export type {
  RequestSignalAssignedNotificationsError,
  RequestSignalAssignedNotificationsInput,
  RequestSignalAssignedNotificationsResult,
  SignalAssignedNotificationRequest,
} from "./use-cases/request-signal-assigned-notifications.ts"
export { requestSignalAssignedNotificationsUseCase } from "./use-cases/request-signal-assigned-notifications.ts"
export type {
  RequestSignalDiscoveredNotificationsError,
  RequestSignalDiscoveredNotificationsInput,
  RequestSignalDiscoveredNotificationsResult,
  SignalDiscoveredNotificationRequest,
} from "./use-cases/request-signal-discovered-notifications.ts"
export { requestSignalDiscoveredNotificationsUseCase } from "./use-cases/request-signal-discovered-notifications.ts"
export type {
  RequestSignalRegressedNotificationsError,
  RequestSignalRegressedNotificationsInput,
  RequestSignalRegressedNotificationsResult,
  SignalRegressedNotificationRequest,
} from "./use-cases/request-signal-regressed-notifications.ts"
export { requestSignalRegressedNotificationsUseCase } from "./use-cases/request-signal-regressed-notifications.ts"
export type {
  RequestWrappedReportNotificationsError,
  RequestWrappedReportNotificationsInput,
  RequestWrappedReportNotificationsResult,
  WrappedReportNotificationRequest,
} from "./use-cases/request-wrapped-report-notifications.ts"
export { requestWrappedReportNotificationsUseCase } from "./use-cases/request-wrapped-report-notifications.ts"
export type {
  NotificationEmailProject,
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
