import { destinationQuarantinedPayloadSchema } from "@domain/notifications"
import { Text } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { PlugZapIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { BaseNotification } from "../base-notification.tsx"

/**
 * "Data destination quarantined" — the `destinations`-group fan-out kind.
 * The destination name rides on the payload (no live destination resolver in
 * the bell); the project slug is resolved live for the settings deep link.
 */
export function DestinationQuarantinedNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = destinationQuarantinedPayloadSchema.safeParse(notification.payload)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, notification.projectId ?? " ")).findOne(),
    [notification.projectId ?? null],
  )

  if (!parsed.success) {
    return (
      <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  const url = project ? `/projects/${project.slug}/settings/data-destinations/${parsed.data.destinationId}` : undefined

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<PlugZapIcon className="h-4 w-4 text-foreground-muted" />}
      title={`Data destination “${parsed.data.destinationName}” stopped syncing.`}
      description={parsed.data.failureMessage ?? "Update the API key to reconnect it."}
      {...(url ? { url } : {})}
    />
  )
}
