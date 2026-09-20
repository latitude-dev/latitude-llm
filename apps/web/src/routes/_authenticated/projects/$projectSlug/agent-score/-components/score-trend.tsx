import { Chart, type ChartSeries, Icon, Skeleton, Tabs, Text, useChartCssTheme } from "@repo/ui"
import { CircleCheckIcon, CircleDashedIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"
import type {
  AgentScoreExplanationRecord,
  AgentScoreRecord,
} from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { ChartHeader } from "../../-components/chart-header.tsx"
import { formatCount, formatDate, formatFullDate } from "./agent-score-format.ts"
import { type AgentScoreReadinessView, agentScoreReadiness, type DimensionReadinessRow } from "./score-readiness.ts"

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

function ReadinessProgress({
  readiness,
}: {
  readonly readiness: Extract<AgentScoreReadinessView, { kind: "sessions" }>
}) {
  const label = `${formatCount(readiness.current)} of ${formatCount(readiness.required)} eligible sessions`
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(readiness.progress * 100)}
      className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <span className="h-full rounded-full bg-primary" style={{ width: `${readiness.progress * 100}%` }} />
    </div>
  )
}

function ReadinessIcon({ state }: { readonly state: DimensionReadinessRow["state"] }) {
  if (state === "ready") return <Icon icon={CircleCheckIcon} size="xs" color="successMutedForeground" />
  if (state === "actionNeeded") return <Icon icon={TriangleAlertIcon} size="xs" color="warningMutedForeground" />
  return <Icon icon={CircleDashedIcon} size="xs" color="foregroundMuted" />
}

function DimensionReadiness({
  readiness,
}: {
  readonly readiness: Extract<AgentScoreReadinessView, { kind: "dimensions" }>
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-1/4" />
          <col />
          <col className="w-1/4" />
        </colgroup>
        <tbody>
          {readiness.rows.map((row) => (
            <tr key={row.dimension} className="border-t border-border first:border-t-0">
              <td className="py-1.5 pr-3 align-middle">
                <Text.H6B>{row.label}</Text.H6B>
              </td>
              <td className="min-w-0 py-1.5 pr-3 align-middle">
                <span className="flex min-w-0 items-start gap-1.5">
                  <ReadinessIcon state={row.state} />
                  <Text.H6 color={row.state === "actionNeeded" ? "warningMutedForeground" : "foregroundMuted"}>
                    {row.status}
                  </Text.H6>
                </span>
              </td>
              <td className="py-1.5 text-right align-middle">
                {row.value ? <Text.H6 className="tabular-nums">{row.value}</Text.H6> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Text.H7 color="foregroundMuted">
        Collecting items update automatically. Scores publish when all five dimensions are ready.
      </Text.H7>
    </div>
  )
}

function ScoreReadiness({
  explanation,
  date,
}: {
  readonly explanation: AgentScoreExplanationRecord["explanation"]
  readonly date: string
}) {
  const readiness = agentScoreReadiness(explanation)
  const summary =
    readiness.kind === "sessions"
      ? "Collecting automatically"
      : readiness.kind === "dimensions"
        ? `${formatCount(readiness.readyDimensions)} of ${formatCount(readiness.totalDimensions)} ready`
        : undefined

  return (
    <div className="flex min-h-[200px] flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Text.H6 color="foregroundMuted">Requirements for this date</Text.H6>
        <Text.H7 color="foregroundMuted">{formatFullDate(date)} UTC</Text.H7>
      </div>
      {summary ? (
        <Text.H6 color="foregroundMuted" className="self-end">
          {summary}
        </Text.H6>
      ) : null}
      {readiness.kind === "sessions" ? (
        <div className="flex flex-1 flex-col justify-center gap-4">
          <div className="flex flex-col gap-1">
            <Text.H4M className="tabular-nums">
              {formatCount(readiness.current)} / {formatCount(readiness.required)} eligible sessions
            </Text.H4M>
            <Text.H6 color="foregroundMuted">
              {formatCount(readiness.remaining)} more {readiness.remaining === 1 ? "session" : "sessions"} needed in the
              selected {formatCount(readiness.windowDays)}-day window.
            </Text.H6>
          </div>
          <ReadinessProgress readiness={readiness} />
          <Text.H7 color="foregroundMuted">This updates automatically as production sessions arrive.</Text.H7>
        </div>
      ) : readiness.kind === "dimensions" ? (
        <DimensionReadiness readiness={readiness} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <Text.H6B>Evidence has not been calculated yet</Text.H6B>
          <Text.H6 color="foregroundMuted">Refresh to evaluate sessions for this date.</Text.H6>
        </div>
      )}
    </div>
  )
}

export function ScoreTrend({
  endDate,
  isCurrentSnapshot,
  history,
  explanation,
  isLoading,
}: {
  readonly endDate: string
  readonly isCurrentSnapshot: boolean
  readonly history: readonly AgentScoreRecord[] | undefined
  readonly explanation: AgentScoreExplanationRecord["explanation"]
  readonly isLoading: boolean
}) {
  const { primary } = useChartCssTheme()
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
    {
      kind: "line",
      name: "Agent vitality",
      values,
      color: primary,
      area: true,
      areaOpacity: 0.12,
      showPoints: true,
      smooth: true,
    },
  ]

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-xl bg-secondary">
      {isLoading ? (
        <div className="flex flex-1 p-4">
          <Skeleton className="min-h-[200px] w-full flex-1 rounded-lg" />
        </div>
      ) : isCurrentSnapshot && hasScores ? (
        <>
          <ChartHeader
            title="Score evolution"
            titleColor="foregroundMuted"
            fromIso={dates[0] ?? endDate}
            toIso={endDate}
            isAllTime={false}
            showWindow={false}
            actions={<Tabs options={RANGE_OPTIONS} active={range} onSelect={setRange} variant="bordered" size="sm" />}
          />
          {versions.size > 1 || windows.size > 1 ? (
            <Text.H7 color="foregroundMuted" className="px-4 pt-1">
              {versions.size > 1
                ? "This range crosses scoring versions, so the line is not a continuous measurement."
                : "This range includes scores calculated over different window lengths."}
            </Text.H7>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 px-4 py-3">
            <Chart
              categories={dates.map((date) => chartLabel(date, range))}
              series={series}
              height={160}
              ariaLabel={`Agent vitality over the last ${dayCount} days`}
              hideLegend
              primaryAxis={{ show: false, min: 0, max: 100, formatValue: (value) => value.toFixed(1) }}
              tooltipTitle={(_, index) => formatDate(dates[index] ?? endDate)}
            />
          </div>
        </>
      ) : (
        <div className="p-6">
          <ScoreReadiness explanation={explanation} date={endDate} />
        </div>
      )}
    </div>
  )
}
