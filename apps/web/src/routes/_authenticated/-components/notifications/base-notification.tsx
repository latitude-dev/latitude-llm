import { cn, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { type ReactNode, useEffect, useRef } from "react"
import {
  markNotificationSeen,
  type NotificationRecord,
} from "../../../../domains/notifications/notifications.functions.ts"
import { LIST_QUERY_KEY, UNREAD_QUERY_KEY } from "./notification-query-keys.ts"

const HOVER_MARK_SEEN_DEBOUNCE_MS = 400

interface BaseNotificationProps {
  /** `undefined` for synthetic rows that don't correspond to a real notification. */
  readonly notificationId?: string
  readonly seenAt: Date | undefined
  readonly createdAt: Date
  readonly icon?: ReactNode
  readonly title?: ReactNode
  readonly description?: ReactNode
  readonly url?: string | undefined
  readonly children?: ReactNode
}

type ListPage = {
  readonly items: readonly NotificationRecord[]
  readonly hasMore: boolean
  readonly nextCursor: unknown
}
type ListData = { readonly pages: readonly ListPage[]; readonly pageParams: readonly unknown[] }

function useMarkSeenOnHover(notificationId: string | undefined, seenAt: Date | undefined) {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const mutation = useMutation({
    mutationFn: (id: string) => markNotificationSeen({ data: { notificationId: id } }),
    onMutate: (id) => {
      const now = new Date().toISOString()
      queryClient.setQueryData<ListData>(LIST_QUERY_KEY, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === id && item.seenAt === null ? { ...item, seenAt: now } : item)),
          })),
        }
      })
      queryClient.setQueryData<{ readonly count: number }>(UNREAD_QUERY_KEY, (old) => ({
        count: Math.max(0, (old?.count ?? 0) - 1),
      }))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY })
    },
  })

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => clearTimer, [])

  const canMark = notificationId !== undefined && seenAt === undefined

  const scheduleMark = () => {
    if (!canMark || firedRef.current || timerRef.current !== null) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (firedRef.current) return
      firedRef.current = true
      mutation.mutate(notificationId)
    }, HOVER_MARK_SEEN_DEBOUNCE_MS)
  }

  const fireNow = () => {
    clearTimer()
    if (!canMark || firedRef.current) return
    firedRef.current = true
    mutation.mutate(notificationId)
  }

  return {
    onPointerEnter: scheduleMark,
    onPointerLeave: clearTimer,
    onFocus: scheduleMark,
    onBlur: clearTimer,
    onClick: fireNow,
  }
}

const cardClasses =
  "relative flex w-full flex-row items-start gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"

function BaseNotificationContent({
  seenAt,
  createdAt,
  icon,
  title,
  description,
  children,
}: Omit<BaseNotificationProps, "url" | "notificationId">) {
  const isUnseen = seenAt === undefined

  return (
    <>
      {icon ? (
        <div
          className={cn("w-8 h-8 rounded-lg flex shrink-0 items-center justify-center", {
            "bg-muted text-muted-foreground": !isUnseen,
            "bg-accent text-primary": isUnseen,
          })}
        >
          {icon}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title ? typeof title === "string" ? <Text.H5>{title}</Text.H5> : title : null}
        {description ? (
          typeof description === "string" ? (
            <Text.H6 color="foregroundMuted">{description}</Text.H6>
          ) : (
            description
          )
        ) : null}
        {children}
        <Text.H6 color="foregroundMuted" className="pt-1" noWrap>
          {relativeTime(createdAt)}
        </Text.H6>
      </div>
      {isUnseen && <div aria-hidden className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />}
    </>
  )
}

export function BaseNotification({
  notificationId,
  seenAt,
  createdAt,
  icon,
  title,
  description,
  url,
  children,
}: BaseNotificationProps) {
  const handlers = useMarkSeenOnHover(notificationId, seenAt)
  const content = (
    <BaseNotificationContent seenAt={seenAt} createdAt={createdAt} icon={icon} title={title} description={description}>
      {children}
    </BaseNotificationContent>
  )

  if (url) {
    return (
      <Link to={url} className={cardClasses} {...handlers}>
        {content}
      </Link>
    )
  }

  return (
    <div className={cardClasses} {...handlers}>
      {content}
    </div>
  )
}
