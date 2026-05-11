import { Text } from "@repo/ui"
import { IssueLifecycleStatuses } from "../../../../../../components/issues/issue-lifecycle-statuses.tsx"

/**
 * Compact "this is the issue this notification is about" card. Shown
 * underneath the notification's title text. Renders the issue's name plus
 * its current lifecycle status.
 *
 * The card itself is non-interactive — the parent `BaseNotification` is
 * already a click target wrapping the whole row, so making this card a
 * second link would create a nested-anchor invalid HTML.
 */
export function IssueSummaryCard({ name, states }: { readonly name: string; readonly states: readonly string[] }) {
  return (
    <>
      <Text.H5M color="foregroundMuted">{name}</Text.H5M>
      {states.length > 0 ? <IssueLifecycleStatuses states={states} wrap={false} /> : null}
    </>
  )
}
