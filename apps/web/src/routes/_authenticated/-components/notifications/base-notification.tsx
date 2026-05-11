import { cn, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useNotificationFeed } from "./notification-feed-context.tsx"

interface BaseNotificationProps {
  readonly seenAt: Date | undefined
  readonly icon?: ReactNode
  readonly title?: ReactNode
  readonly description?: ReactNode
  readonly url?: string | undefined
  readonly children?: ReactNode
}

/**
 * A notification is "unseen for this popover open" when either:
 *   - it has never been seen (`seenAt === undefined`), or
 *   - its `seenAt` is newer than the timestamp captured when the popover
 *     opened (i.e. it was just marked seen by the open's mark-all-seen
 *     mutation, but should still visually read as unseen until the user
 *     closes & reopens the popover).
 *
 * Without an active feed context (`openedAt === null`) we treat everything
 * as seen — there's no "this open" to compare against.
 */
function computeIsUnseen(seenAt: Date | undefined, openedAt: Date | null): boolean {
  if (openedAt === null) return false
  if (seenAt === undefined) return true
  return seenAt > openedAt
}

const cardClasses =
  "relative flex w-full flex-row items-start gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"

function BaseNotificationContent({ seenAt, icon, title, description, children }: Omit<BaseNotificationProps, "url">) {
  const { openedAt } = useNotificationFeed()
  const isUnseen = computeIsUnseen(seenAt, openedAt)

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
      </div>
      {isUnseen && <div aria-hidden className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />}
    </>
  )
}

/**
 * Card-like row used by every per-type notification renderer in the bell
 * popover. Provides shared affordances — hover background, padding, optional
 * left icon — and routes the whole card through the TanStack `Link` when a
 * `url` is supplied so navigation stays SPA-internal.
 */
export function BaseNotification({ seenAt, icon, title, description, url, children }: BaseNotificationProps) {
  if (url) {
    return (
      <Link to={url} className={cardClasses}>
        <BaseNotificationContent seenAt={seenAt} icon={icon} title={title} description={description}>
          {children}
        </BaseNotificationContent>
      </Link>
    )
  }

  return (
    <div className={cardClasses}>
      <BaseNotificationContent seenAt={seenAt} icon={icon} title={title} description={description}>
        {children}
      </BaseNotificationContent>
    </div>
  )
}
