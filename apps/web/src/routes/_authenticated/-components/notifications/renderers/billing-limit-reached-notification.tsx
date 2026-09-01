import { billingLimitReachedPayloadSchema } from "@domain/notifications"
import { Text } from "@repo/ui"
import { CircleDollarSignIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../base-notification.tsx"

export function BillingLimitReachedNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = billingLimitReachedPayloadSchema.safeParse(notification.payload)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)

  if (!parsed.success) {
    return (
      <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  const included = parsed.data.includedCredits.toLocaleString("en-US")
  const { title, description } =
    parsed.data.limitKind === "spend-cap"
      ? {
          title: "Monthly spend limit reached",
          description: "Your organization has reached its configured monthly spend limit.",
        }
      : parsed.data.limitKind === "overage-started"
        ? {
            title: "Overage billing started",
            description: `Your organization has used all ${included} included credits. Additional usage is billed as overage.`,
          }
        : {
            title: "Plan credit limit reached",
            description: `Your organization has used all ${included} included credits for this billing period.`,
          }

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      icon={<CircleDollarSignIcon className="h-4 w-4 text-foreground-muted" />}
      title={title}
      description={description}
      url="/settings/billing"
    />
  )
}
