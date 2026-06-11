import { issueAssignedPayloadSchema } from "@domain/notifications"
import { Text } from "@repo/ui"
import { UserRoundPlusIcon } from "lucide-react"
import { useMemberByUserIdMap } from "../../../../../domains/members/members.collection.ts"
import type { NotificationRecord } from "../../../../../domains/notifications/notifications.functions.ts"
import { BaseNotification } from "../base-notification.tsx"
import { useIssueUrl, useLiveIssueSummary } from "./incident/-incident-helpers.ts"
import { IssueSummaryCard } from "./incident/issue-summary-card.tsx"

/**
 * "X assigned you to an issue" — the `personal`-group, single-recipient
 * kind. The payload deliberately carries only ids; the issue name/states
 * and the actor's display name are live-resolved at render time.
 */
export function IssueAssignedNotification({ notification }: { readonly notification: NotificationRecord }) {
  const parsed = issueAssignedPayloadSchema.safeParse(notification.payload)
  const seenAt = notification.seenAt ? new Date(notification.seenAt) : undefined
  const createdAt = new Date(notification.createdAt)
  const target = { projectId: notification.projectId, sourceId: parsed.success ? parsed.data.issueId : "" }
  const live = useLiveIssueSummary(target)
  const url = useIssueUrl(target)
  const memberByUserId = useMemberByUserIdMap()

  if (!parsed.success) {
    return (
      <BaseNotification notificationId={notification.id} seenAt={seenAt} createdAt={createdAt}>
        <Text.H6 color="foregroundMuted">Unsupported notification</Text.H6>
      </BaseNotification>
    )
  }

  const actor = memberByUserId.get(parsed.data.actorUserId)
  const actorName = actor
    ? actor.name?.trim() && actor.name.trim().length > 0
      ? actor.name.trim()
      : actor.email
    : undefined

  return (
    <BaseNotification
      notificationId={notification.id}
      seenAt={seenAt}
      createdAt={createdAt}
      projectId={notification.projectId}
      icon={<UserRoundPlusIcon />}
      title={`${actorName ?? "A teammate"} assigned you to an issue.`}
      url={url}
    >
      {live?.name ? <IssueSummaryCard name={live.name} states={live.states} /> : null}
    </BaseNotification>
  )
}
