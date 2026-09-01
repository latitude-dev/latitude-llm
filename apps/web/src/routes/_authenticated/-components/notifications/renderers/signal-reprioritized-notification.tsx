import { signalReprioritizedPayloadSchema } from "@domain/notifications"
import type { SignalPriority } from "@domain/signals"
import { Text } from "@repo/ui"
import { FlagIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../base-notification.tsx"
import { useLiveSignalSummary, useSignalUrl } from "./incident/-incident-helpers.ts"
import { SignalSummaryCard } from "./incident/signal-summary-card.tsx"

const priorityLabel = (priority: SignalPriority | null): string =>
  priority ? `${priority.charAt(0).toUpperCase()}${priority.slice(1)}` : "None"

export function SignalReprioritizedNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = signalReprioritizedPayloadSchema.safeParse(notification.payload)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  // A null projectId disables the summary query; an unparseable payload has no signal to look up.
  const target = parsed.success
    ? { projectId: notification.projectId, sourceId: parsed.data.signalId }
    : { projectId: null, sourceId: "" }
  const live = useLiveSignalSummary(target)
  const url = useSignalUrl(target)

  if (!parsed.success) {
    return (
      <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  const { priority, previousPriority } = parsed.data

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<FlagIcon />}
      title={`Signal priority raised: ${priorityLabel(previousPriority)} → ${priorityLabel(priority)}.`}
      url={url}
    >
      {live?.name ? <SignalSummaryCard name={live.name} states={live.states} /> : null}
    </BaseNotification>
  )
}
