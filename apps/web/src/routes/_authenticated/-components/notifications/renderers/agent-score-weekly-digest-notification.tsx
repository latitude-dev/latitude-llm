import { agentScoreWeeklyDigestPayloadSchema } from "@domain/notifications"
import { Text } from "@repo/ui"
import { eq } from "@tanstack/react-db"
import { GaugeIcon } from "lucide-react"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { BaseNotification } from "../base-notification.tsx"

const signed = (delta: number): string => `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`

/**
 * Weekly Agent Score digest, broadcast to every org member for each scored project. The payload
 * carries the week's numbers; the deep link is built from the live projects collection so it keeps
 * working after a rename and disappears when the project is gone.
 */
export function AgentScoreWeeklyDigestNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = agentScoreWeeklyDigestPayloadSchema.safeParse(notification.payload)
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

  const { score, comparison, date } = parsed.data
  const movement =
    comparison.status === "comparable" && comparison.delta !== 0 && comparison.significant
      ? `${signed(comparison.delta)} this week`
      : comparison.status === "comparable"
        ? "steady this week"
        : "no comparison yet"

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<GaugeIcon />}
      title="Your weekly Agent Score"
      description={`${score.toFixed(0)} · ${movement}`}
      url={project ? `/projects/${project.slug}/agent-score?date=${date}` : undefined}
    />
  )
}
