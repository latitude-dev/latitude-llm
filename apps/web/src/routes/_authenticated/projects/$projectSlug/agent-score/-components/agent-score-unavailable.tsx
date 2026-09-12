import { Text } from "@repo/ui"
import { formatDate } from "./agent-score-format.ts"

/**
 * What the page says on a day with no score.
 *
 * It does not show a partial score, a midpoint, or the last day that worked. A dimension that could
 * not be measured makes the whole composite unpublishable, and four numbers beside one gap invites
 * the reader to average what is there. What it can honestly offer is the date, the reason, and the
 * evidence that did accumulate — which lives one section down.
 */
export function AgentScoreUnavailable({ date, hasHistory }: { readonly date: string; readonly hasHistory: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-backgroundCode p-6">
      <Text.H5M>No score for {formatDate(date)}</Text.H5M>
      <Text.H6 color="foregroundMuted">
        A score is published only when all five dimensions pass their coverage and confidence floors. One that did not
        withholds the whole score, so no partial number is shown.
      </Text.H6>
      {hasHistory ? (
        <Text.H6 color="foregroundMuted">Earlier published scores remain in the trend below.</Text.H6>
      ) : (
        <Text.H6 color="foregroundMuted">
          This project has not published a score yet. Coverage builds as more sessions are examined.
        </Text.H6>
      )}
    </div>
  )
}
