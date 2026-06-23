import { signalDiscoveredPayloadSchema } from "@domain/notifications"
import { Text } from "@repo/ui"
import { RadarIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../base-notification.tsx"
import { useLiveSignalSummary, useSignalUrl } from "./incident/-incident-helpers.ts"
import { SignalSummaryCard } from "./incident/signal-summary-card.tsx"

export function SignalDiscoveredNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = signalDiscoveredPayloadSchema.safeParse(notification.payload)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const target = { projectId: notification.projectId, sourceId: parsed.success ? parsed.data.signalId : "" }
  const live = useLiveSignalSummary(target)
  const url = useSignalUrl(target)

  if (!parsed.success) {
    return (
      <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<RadarIcon />}
      title="New signal discovered."
      url={url}
    >
      {live?.name ? <SignalSummaryCard name={live.name} states={live.states} /> : null}
    </BaseNotification>
  )
}
