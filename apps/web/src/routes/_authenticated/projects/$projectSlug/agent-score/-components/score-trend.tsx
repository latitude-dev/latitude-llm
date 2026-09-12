import { Chart, type ChartSeries, Skeleton, Tabs, Text } from "@repo/ui"
import { useState } from "react"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatDate } from "./agent-score-format.ts"

const SCORE_COLOR = "hsl(var(--viz-red))"
const DAY_MS = 86_400_000

type TrendRange = "7d" | "30d"

const RANGE_OPTIONS = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
] as const

export const calendarEndingOn = (date: string, dayCount: number): string[] => {
  const end = new Date(`${date}T00:00:00.000Z`).getTime()
  return Array.from({ length: dayCount }, (_, index) =>
    new Date(end - (dayCount - index - 1) * DAY_MS).toISOString().slice(0, 10),
  )
}

const chartLabel = (date: string, range: TrendRange): string => {
  const value = new Date(`${date}T00:00:00.000Z`)
  return range === "7d"
    ? value.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })
    : value.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

export function ScoreTrend({
  endDate,
  history,
  isLoading,
}: {
  readonly endDate: string
  readonly history: readonly AgentScoreRecord[] | undefined
  readonly isLoading: boolean
}) {
  const [range, setRange] = useState<TrendRange>("7d")
  const dayCount = range === "7d" ? 7 : 30
  const dates = calendarEndingOn(endDate, dayCount)
  const byDate = new Map(history?.map((entry) => [entry.date, entry]))
  const values = dates.map((date) => byDate.get(date)?.score ?? Number.NaN)
  const hasScores = values.some(Number.isFinite)
  const selectedHistory = dates.flatMap((date) => {
    const entry = byDate.get(date)
    return entry ? [entry] : []
  })
  const versions = new Set(selectedHistory.map((entry) => entry.scoringVersion))
  const windows = new Set(selectedHistory.map((entry) => entry.windowDays))
  const series: readonly ChartSeries[] = [
    { kind: "line", name: "Agent vitality", values, color: SCORE_COLOR, area: true, smooth: true },
  ]

  return (
    <div className="flex min-h-[296px] min-w-0 flex-1 flex-col gap-4 rounded-xl bg-secondary p-6">
      <div className="flex flex-row items-center justify-between gap-3">
        <Text.H6 color="foregroundMuted">Score evolution</Text.H6>
        <Tabs options={RANGE_OPTIONS} active={range} onSelect={setRange} variant="bordered" size="sm" />
      </div>
      {isLoading ? (
        <Skeleton className="min-h-[200px] w-full flex-1 rounded-lg" />
      ) : hasScores ? (
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-2">
          <Chart
            categories={dates.map((date) => chartLabel(date, range))}
            series={series}
            height={200}
            ariaLabel={`Agent vitality over the last ${dayCount} days`}
            hideLegend
            primaryAxis={{ show: false, min: 0, max: 100, formatValue: (value) => value.toFixed(1) }}
            tooltipTitle={(_, index) => formatDate(dates[index] ?? endDate)}
          />
          {versions.size > 1 || windows.size > 1 ? (
            <Text.H7 color="foregroundMuted">
              {versions.size > 1
                ? "This range crosses scoring versions, so the line is not a continuous measurement."
                : "This range includes scores calculated over different window lengths."}
            </Text.H7>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <Text.H6B>No published scores in the last {dayCount} days</Text.H6B>
          <Text.H6 color="foregroundMuted">
            The graph fills in when all five dimensions can be measured on the same day.
          </Text.H6>
        </div>
      )}
    </div>
  )
}
