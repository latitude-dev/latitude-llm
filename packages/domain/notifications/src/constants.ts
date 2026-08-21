/**
 * Leading-throttle window for notification request jobs published from domain
 * events. A bare dedupe key becomes a BullMQ jobId; failed jobs are retained,
 * so a permanently failed request would shadow outbox redelivery. The marker
 * expires instead so the event can retry.
 */
export const NOTIFICATION_REQUEST_THROTTLE_MS = 10 * 60 * 1000
