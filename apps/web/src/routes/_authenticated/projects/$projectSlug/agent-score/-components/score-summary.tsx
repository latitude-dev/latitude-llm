import { Icon, Skeleton, Text } from "@repo/ui"
import { ChartNoAxesCombinedIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatCount, formatDateTime, formatFullDate } from "./agent-score-format.ts"

type ScoreHistoryEntry = Pick<AgentScoreRecord, "date" | "score" | "scoringVersion">

const previousScore = (
  snapshot: AgentScoreRecord | null,
  history: readonly ScoreHistoryEntry[] | undefined,
): ScoreHistoryEntry | null => {
  if (!snapshot || !history) return null
  const previous = [...history].reverse().find((entry) => entry.date < snapshot.date)
  return previous?.scoringVersion === snapshot.scoringVersion ? previous : null
}

function ScoreDelta({ value }: { readonly value: number | null }) {
  if (value === null) return null
  const decreasing = value < 0
  return (
    <span
      className={`flex flex-row items-center gap-0.5 ${decreasing ? "text-destructive-muted-foreground" : "text-success-muted-foreground"}`}
    >
      <Icon icon={ChartNoAxesCombinedIcon} size="xs" />
      <Text.H5 color="inherit" className="tabular-nums">
        {Math.abs(value * 100).toFixed(1)}% {decreasing ? "down" : "up"}
      </Text.H5>
    </span>
  )
}

function SummaryItem({
  label,
  children,
  context,
}: {
  readonly label: string
  readonly children: ReactNode
  readonly context?: string
}) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-1 p-2">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {children}
      {context ? <Text.H6 color="foregroundMuted">{context}</Text.H6> : null}
    </div>
  )
}

export function ScoreSummary({
  snapshot,
  history,
  isLoading,
  actions,
}: {
  readonly snapshot: AgentScoreRecord | null
  readonly history: readonly ScoreHistoryEntry[] | undefined
  readonly isLoading: boolean
  readonly actions?: ReactNode
}) {
  const previous = previousScore(snapshot, history)
  const delta = snapshot && previous && previous.score > 0 ? (snapshot.score - previous.score) / previous.score : null
  const [computedDate, computedTime] = snapshot ? formatDateTime(snapshot.createdAt).split(" at ") : []
  return (
    <div className="flex items-start gap-6 px-2">
      {isLoading ? (
        <div className="flex flex-1 gap-4 p-2">
          <Skeleton className="h-14 w-full" />
        </div>
      ) : snapshot ? (
        <div className="flex min-w-0 flex-1 flex-row gap-6 overflow-x-auto">
          <SummaryItem label="Sessions">
            <Text.H5 className="tabular-nums">{formatCount(snapshot.eligibleSessionCount)}</Text.H5>
          </SummaryItem>
          <SummaryItem label="Change">
            {delta === null ? <Text.H5 color="foregroundMuted">—</Text.H5> : <ScoreDelta value={delta} />}
          </SummaryItem>
          <SummaryItem label="Window">
            <Text.H5>{snapshot.windowDays} days</Text.H5>
          </SummaryItem>
          <SummaryItem label="Score date">
            <Text.H5>{formatFullDate(snapshot.date)}</Text.H5>
          </SummaryItem>
          <SummaryItem label="Computed" context={computedTime?.replace(/ UTC$/, "")}>
            <Text.H5>{computedDate}</Text.H5>
          </SummaryItem>
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-2">
          <Text.H6 color="foregroundMuted">Score not ready</Text.H6>
          <Text.H7 color="foregroundMuted">No score was published for this date.</Text.H7>
        </div>
      )}
      {snapshot && actions ? <div className="shrink-0 pt-2 pr-2">{actions}</div> : null}
    </div>
  )
}
