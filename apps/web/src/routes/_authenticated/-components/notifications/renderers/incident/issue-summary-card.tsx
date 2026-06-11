import { Icon, Text } from "@repo/ui"
import { IssueLifecycleStatuses } from "../../../../../../components/issues/issue-lifecycle-statuses.tsx"
import {
  ISSUE_PRIORITY_META,
  type IssuePriorityValue,
} from "../../../../../../components/issues/issue-priority-meta.tsx"
import { useMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"

/**
 * Compact "this is the issue this notification is about" card. Shown
 * underneath the notification's title text. Renders the issue's name plus
 * its current lifecycle status, the triage priority snapshotted onto the
 * incident payload (badge-style icon + label), and a muted "Assigned to"
 * line resolved live from the snapshotted assignee id.
 *
 * The card itself is non-interactive — the parent `BaseNotification` is
 * already a click target wrapping the whole row, so making this card a
 * second link would create a nested-anchor invalid HTML.
 */
export function IssueSummaryCard({
  name,
  states,
  priority,
  assigneeId,
}: {
  readonly name: string
  readonly states: readonly string[]
  readonly priority?: IssuePriorityValue | null | undefined
  readonly assigneeId?: string | null | undefined
}) {
  const memberByUserId = useMemberByUserIdMap()
  const assignee = assigneeId ? memberByUserId.get(assigneeId) : undefined
  const assigneeName = assignee
    ? assignee.name?.trim() && assignee.name.trim().length > 0
      ? assignee.name.trim()
      : assignee.email
    : undefined
  const priorityMeta = priority ? ISSUE_PRIORITY_META[priority] : undefined

  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <Text.H5M color="foregroundMuted" ellipsis noWrap>
          {name}
        </Text.H5M>
        {priorityMeta ? (
          <span className="flex shrink-0 items-center gap-1">
            <Icon icon={priorityMeta.icon} size="sm" color={priorityMeta.iconColor} />
            <Text.H6 color="foregroundMuted">{priorityMeta.label}</Text.H6>
          </span>
        ) : null}
      </div>
      {states.length > 0 ? <IssueLifecycleStatuses states={states} wrap={false} /> : null}
      {assigneeName ? <Text.H6 color="foregroundMuted">Assigned to {assigneeName}</Text.H6> : null}
    </>
  )
}
