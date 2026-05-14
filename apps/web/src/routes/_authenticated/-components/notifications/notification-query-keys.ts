/**
 * Shared query keys for the bell notifications feature. Lifted out of
 * `notification-bell.tsx` so that `base-notification.tsx` can patch the
 * cache optimistically when a row is marked seen on hover.
 */
export const PAGE_SIZE = 5
const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const
export const UNREAD_QUERY_KEY = [...NOTIFICATIONS_QUERY_KEY, "unread-count"] as const
export const LIST_QUERY_KEY = [...NOTIFICATIONS_QUERY_KEY, "list", PAGE_SIZE] as const
