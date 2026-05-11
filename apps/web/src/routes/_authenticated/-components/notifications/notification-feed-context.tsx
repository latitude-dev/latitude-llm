import { createContext, useContext } from "react"

interface NotificationFeedContextValue {
  /**
   * Timestamp captured when the bell popover most recently opened. Notifications
   * whose `seenAt` is null OR newer than this are highlighted as "unseen for
   * this open" — anything that was already seen in a previous open fades.
   *
   * `null` means we're rendering outside an active feed, in which case we fall
   * back to "everything is seen" (no highlights).
   */
  readonly openedAt: Date | null
}

const NotificationFeedContext = createContext<NotificationFeedContextValue>({ openedAt: null })

export const NotificationFeedProvider = NotificationFeedContext.Provider

export const useNotificationFeed = (): NotificationFeedContextValue => useContext(NotificationFeedContext)
