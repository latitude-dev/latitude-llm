import { traceDeletionFinishedPayloadSchema } from "@domain/notifications"
import { Text } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { Trash2Icon } from "lucide-react"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { BaseNotification } from "../base-notification.tsx"

export function TraceDeletionFinishedNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = traceDeletionFinishedPayloadSchema.safeParse(notification.payload)
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

  const { status, matchedTraceCount } = parsed.data
  const traces = `${matchedTraceCount.toLocaleString()} ${matchedTraceCount === 1 ? "trace" : "traces"}`
  const url = project ? `/projects/${project.slug}/settings/data-deletion` : undefined

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<Trash2Icon className="h-4 w-4 text-foreground-muted" />}
      title={status === "completed" ? "Your trace deletion finished." : "Your trace deletion failed."}
      description={
        status === "completed"
          ? `${traces} were permanently deleted.`
          : `It stopped after deleting ${traces}. Request it again to delete the rest.`
      }
      {...(url ? { url } : {})}
    />
  )
}
