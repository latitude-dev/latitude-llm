import { Chart, type ChartSeries, Skeleton, Text } from "@repo/ui"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { DIMENSION_LABEL, formatDate, SCORE_DIMENSION_ORDER, type ScoreDimensionKey } from "./agent-score-format.ts"

const COMPOSITE_COLOR = "hsl(217 91% 60%)"
const DIMENSION_COLORS: Record<ScoreDimensionKey, string> = {
  outcome: "hsl(152 55% 45%)",
  reliability: "hsl(35 90% 55%)",
  cost: "hsl(262 60% 62%)",
  speed: "hsl(199 75% 50%)",
  safety: "hsl(0 65% 58%)",
}

/**
 * Every UTC date between the first and last published score.
 *
 * Built from the calendar rather than from the rows, so a day the project did not publish leaves a
 * hole in the line instead of being closed over. A continuous line across a gap would say the score
 * held steady through a day nobody measured.
 */
const calendarBetween = (first: string, last: string): string[] => {
  const dates: string[] = []
  for (
    let time = new Date(`${first}T00:00:00.000Z`).getTime();
    time <= new Date(`${last}T00:00:00.000Z`).getTime();
    time += 86_400_000
  ) {
    dates.push(new Date(time).toISOString().slice(0, 10))
  }
  return dates
}

export function ScoreTrend({
  history,
  isLoading,
}: {
  readonly history: readonly AgentScoreRecord[] | undefined
  readonly isLoading: boolean
}) {
  if (isLoading) return <Skeleton className="h-[220px] w-full rounded-lg" />
  if (!history || history.length === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border p-4">
        <Text.H6B>No published history yet</Text.H6B>
        <Text.H6 color="foregroundMuted">
          The trend appears once this project has published a score on at least one day.
        </Text.H6>
      </div>
    )
  }

  const first = history[0]?.date as string
  const last = history[history.length - 1]?.date as string
  const dates = calendarBetween(first, last)
  const byDate = new Map(history.map((entry) => [entry.date, entry]))

  // `NaN` rather than zero for a day with no score: echarts breaks the line there, and a zero would
  // draw an agent that scored nothing rather than one that could not be measured.
  const valuesFor = (pick: (entry: AgentScoreRecord) => number | undefined): number[] =>
    dates.map((date) => {
      const entry = byDate.get(date)
      const value = entry ? pick(entry) : undefined
      return value === undefined ? Number.NaN : value
    })

  const series: ChartSeries[] = [
    { kind: "line", name: "Agent Score", values: valuesFor((entry) => entry.score), color: COMPOSITE_COLOR },
    ...SCORE_DIMENSION_ORDER.map(
      (dimension): ChartSeries => ({
        kind: "line",
        name: DIMENSION_LABEL[dimension],
        values: valuesFor((entry) => entry.dimensions[dimension]?.score),
        color: DIMENSION_COLORS[dimension],
      }),
    ),
  ]

  const versions = new Set(history.map((entry) => entry.scoringVersion))
  const windows = new Set(history.map((entry) => entry.windowDays))

  return (
    <div className="flex flex-col gap-3">
      <Chart
        categories={dates.map(formatDate)}
        series={series}
        height={220}
        ariaLabel="Agent Score over time"
        primaryAxis={{ name: "Score", formatValue: (value) => value.toFixed(0) }}
      />
      {versions.size > 1 || windows.size > 1 ? (
        <Text.H6 color="foregroundMuted">
          {versions.size > 1
            ? "This range spans more than one scoring version. Points on either side of the change are not a continuous measurement."
            : "This range spans more than one window length, so each point summarizes a different amount of traffic."}
        </Text.H6>
      ) : null}
    </div>
  )
}
