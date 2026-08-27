import { cn, Icon, Text } from "@repo/ui"
import { ShieldAlertIcon } from "lucide-react"
import type { AgentScoreSnapshot, ScoreDimension } from "./agent-score-mock.ts"
import { scrollToDimension } from "./dimension-anchors.ts"
import { ScoreChip } from "./score-chip.tsx"
import { BAR_TRACK, formatPoints, formatSessions, ROW_HOVER, SEVERITY_FILL } from "./score-formatters.ts"

const ROW_CLASSES = cn(
  "flex min-w-0 cursor-pointer flex-row items-center gap-3 rounded-md p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  ROW_HOVER,
)

function DeficitBar({ deficit, largest }: { readonly deficit: number | null; readonly largest: number }) {
  if (deficit === null || deficit <= 0 || largest <= 0) return <div className="w-24 shrink-0" />
  return (
    <div className={cn("h-2 w-24 shrink-0 overflow-hidden rounded-full", BAR_TRACK)}>
      <div
        className={cn("h-full rounded-full", SEVERITY_FILL.ruined)}
        style={{ width: `${Math.max(4, (deficit / largest) * 100)}%` }}
      />
    </div>
  )
}

function DimensionRow({
  dimension,
  largestDeficit,
  belowFloor,
}: {
  readonly dimension: ScoreDimension
  readonly largestDeficit: number
  readonly belowFloor: boolean
}) {
  return (
    <button type="button" onClick={() => scrollToDimension(dimension.key)} className={ROW_CLASSES}>
      <ScoreChip score={dimension.subScore} {...(dimension.notMeasured ? { label: "n/a" } : {})} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Text.H5M>{dimension.label}</Text.H5M>
        <Text.H6 color="foregroundMuted" ellipsis noWrap>
          {dimension.notMeasured ?? (belowFloor ? `${dimension.question} Not scored yet.` : dimension.question)}
        </Text.H6>
      </div>
      <DeficitBar deficit={dimension.deficit} largest={largestDeficit} />
      <Text.H5 className="w-14 text-right tabular-nums" noWrap>
        {formatPoints(dimension.deficit)}
      </Text.H5>
    </button>
  )
}

export function DimensionSummaryPanel({ snapshot }: { readonly snapshot: AgentScoreSnapshot }) {
  const belowFloor = snapshot.score === null
  const dimensionDeficits = snapshot.dimensions.map((dimension) => dimension.deficit ?? 0)
  const largestDeficit = Math.max(...dimensionDeficits, snapshot.safety.deficit)
  const safety = snapshot.safety

  return (
    <div className="flex flex-col rounded-lg bg-secondary p-4">
      {snapshot.dimensions.map((dimension) => (
        <DimensionRow
          key={dimension.key}
          dimension={dimension}
          largestDeficit={largestDeficit}
          belowFloor={belowFloor}
        />
      ))}
      <button type="button" onClick={() => scrollToDimension("safety")} className={ROW_CLASSES}>
        <div
          className={cn("flex h-8 min-w-16 items-center justify-center rounded-md px-2", {
            "bg-destructive-muted": safety.confirmedFailures > 0,
            "bg-muted": safety.confirmedFailures === 0,
          })}
        >
          <Icon
            icon={ShieldAlertIcon}
            size="sm"
            color={safety.confirmedFailures > 0 ? "destructiveMutedForeground" : "foregroundMuted"}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text.H5M>Safety</Text.H5M>
          <Text.H6 color="foregroundMuted" ellipsis noWrap>
            {safety.confirmedFailures === 0
              ? "Nothing confirmed, so the score keeps its full range."
              : `${safety.confirmedFailures} confirmed in ${formatSessions(safety.classifiedSessions)} checked sessions. Holds the score at ${safety.cap}.`}
          </Text.H6>
        </div>
        <DeficitBar deficit={safety.deficit} largest={largestDeficit} />
        <Text.H5 className="w-14 text-right tabular-nums" noWrap>
          {formatPoints(safety.isBinding ? safety.deficit : 0)}
        </Text.H5>
      </button>
    </div>
  )
}
