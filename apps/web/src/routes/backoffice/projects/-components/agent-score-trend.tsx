import { Chart, type ChartSeries, Tabs, Text, useChartCssTheme } from "@repo/ui"
import { useState } from "react"
import type { AdminAgentScoreHistoryPointDto } from "../../../../domains/admin/agent-score.functions.ts"
import {
  formatCount,
  formatFullDate,
} from "../../../_authenticated/projects/$projectSlug/agent-score/-components/agent-score-format.ts"
import { calendarEndingOn } from "../../../_authenticated/projects/$projectSlug/agent-score/-components/score-trend.tsx"

const RANGE_OPTIONS = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
] as const

type TrendRange = (typeof RANGE_OPTIONS)[number]["id"]

const RANGE_DAYS: Record<TrendRange, number> = { "7d": 7, "30d": 30, "90d": 90 }

const CHART_HEIGHT = 200

const chartLabel = (date: string, range: TrendRange): string => {
  const value = new Date(`${date}T00:00:00.000Z`)
  return range === "7d"
    ? value.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })
    : value.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

export function AgentScoreTrend({
  endDate,
  history,
}: {
  readonly endDate: string
  readonly history: readonly AdminAgentScoreHistoryPointDto[]
}) {
  const { primary } = useChartCssTheme()
  const [range, setRange] = useState<TrendRange>("30d")
  const dayCount = RANGE_DAYS[range]
  const dates = calendarEndingOn(endDate, dayCount)
  const byDate = new Map(history.map((entry) => [entry.date, entry]))
  const values = dates.map((date) => byDate.get(date)?.score ?? Number.NaN)
  const published = dates.flatMap((date) => {
    const entry = byDate.get(date)
    return entry ? [entry] : []
  })
  const versions = new Set(published.map((entry) => entry.scoringVersion))
  const windows = new Set(published.map((entry) => entry.windowDays))
  const caveat =
    versions.size > 1
      ? "This range crosses scoring versions, so the line is not a continuous measurement."
      : windows.size > 1
        ? "This range includes scores calculated over different window lengths."
        : null

  const series: readonly ChartSeries[] = [
    {
      kind: "line",
      name: "Agent Score",
      values,
      color: primary,
      area: true,
      areaOpacity: 0.12,
      showPoints: true,
      smooth: true,
    },
  ]

  return (
    <div className="flex min-h-[296px] min-w-0 flex-1 flex-col gap-2 rounded-xl bg-secondary p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">Score evolution</Text.H6>
        <Tabs options={RANGE_OPTIONS} active={range} onSelect={setRange} variant="bordered" size="sm" />
      </div>

      {published.length > 1 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-2">
          <Chart
            categories={dates.map((date) => chartLabel(date, range))}
            series={series}
            height={CHART_HEIGHT}
            ariaLabel={`Agent Score over the last ${dayCount} days`}
            hideLegend
            primaryAxis={{ show: true, min: 0, max: 100, formatValue: (value) => value.toFixed(0) }}
            tooltipTitle={(_, index) => formatFullDate(dates[index] ?? endDate)}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Text.H7 color="foregroundMuted">
              {formatCount(published.length)} of {formatCount(dayCount)} days published
            </Text.H7>
            <Text.H7 color="foregroundMuted">
              {formatFullDate(dates[0] ?? endDate)} – {formatFullDate(endDate)} UTC
            </Text.H7>
          </div>
          {caveat ? <Text.H7 color="warningMutedForeground">{caveat}</Text.H7> : null}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <Text.H6 color="foregroundMuted">Not enough history to draw a trend.</Text.H6>
          <Text.H7 color="foregroundMuted">
            {published.length === 1
              ? "Only one day in this range has a published score."
              : "No score was published in this range."}
          </Text.H7>
        </div>
      )}
    </div>
  )
}
