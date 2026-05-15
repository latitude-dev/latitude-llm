import {
  Badge,
  BarChart,
  type BarChartDataPoint,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  InfiniteTable,
  type InfiniteTableColumn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import { adminListWrappedAnalytics } from "../../domains/admin/wrapped-analytics.functions.ts"
import type {
  ExcessHistogramDto,
  GatePassRateRowDto,
  PersonalityCountDto,
  PersonalityScoreRowDto,
  ToolMixCheckRowDto,
  WrappedAnalyticsListItemDto,
  WrappedAnalyticsPayloadDto,
} from "../../domains/admin/wrapped-analytics.ts"
import { TITLE_FOR_KIND } from "../wrapped/-components/claude-code/v1/personality-copy.ts"

export const Route = createFileRoute("/backoffice/wrapped")({
  component: BackofficeWrappedAnalyticsPage,
})

function BackofficeWrappedAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["backoffice", "wrapped-analytics"],
    queryFn: () => adminListWrappedAnalytics(),
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-6 py-4">
        <Text.H4 weight="semibold">Wrapped analytics</Text.H4>
        <Text.H6 color="foregroundMuted">
          Latest Wrapped report per project (≥ 7 days old). Click a row to open the report in a new tab.
        </Text.H6>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ListColumn list={data?.list ?? []} isLoading={isLoading} />
        <StatsColumn stats={data?.stats} isLoading={isLoading} />
      </div>
    </div>
  )
}

// ─── List column ────────────────────────────────────────────────────────────

function ListColumn({
  list,
  isLoading,
}: {
  readonly list: ReadonlyArray<WrappedAnalyticsListItemDto>
  readonly isLoading: boolean
}) {
  const columns = useMemo<InfiniteTableColumn<WrappedAnalyticsListItemDto>[]>(
    () => [
      {
        key: "project",
        header: "Project",
        minWidth: 180,
        width: 220,
        render: (row) => (
          <div className="flex min-w-0 flex-col leading-tight">
            <Text.H5 weight="medium" ellipsis noWrap>
              {row.projectName}
            </Text.H5>
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              {row.organizationName} · {row.ownerName}
            </Text.H6>
          </div>
        ),
      },
      {
        key: "personality",
        header: "Personality",
        minWidth: 150,
        width: 180,
        render: (row) => (
          <div className="flex items-center gap-2">
            <Badge variant="outlineMuted">{TITLE_FOR_KIND[row.personalityKind]}</Badge>
            <Text.H6 color="foregroundMuted" noWrap>
              <span className="tabular-nums">{row.personalityScore.toFixed(2)}</span>
            </Text.H6>
          </div>
        ),
      },
      {
        key: "toolCalls",
        header: "Tool calls",
        align: "end",
        minWidth: 90,
        width: 110,
        render: (row) => (
          <Text.H5 weight="medium" noWrap>
            <span className="tabular-nums">{formatCount(row.toolCalls)}</span>
          </Text.H5>
        ),
      },
      {
        key: "sessions",
        header: "Sessions",
        align: "end",
        minWidth: 80,
        width: 100,
        render: (row) => (
          <Text.H6 noWrap>
            <span className="tabular-nums">{formatCount(row.sessions)}</span>
          </Text.H6>
        ),
      },
      {
        key: "createdAt",
        header: "Created",
        align: "end",
        minWidth: 100,
        width: 130,
        render: (row) => (
          <Text.H6 color="foregroundMuted" noWrap>
            {relativeTime(new Date(row.createdAt))}
          </Text.H6>
        ),
      },
    ],
    [],
  )

  const handleRowClick = useCallback((row: WrappedAnalyticsListItemDto) => {
    // Open in a new tab. The Wrapped page is a public surface, not part of
    // the backoffice tree, so we never want to navigate the admin in place.
    if (typeof window !== "undefined") {
      window.open(`/wrapped/${row.id}`, "_blank", "noopener,noreferrer")
    }
  }, [])

  return (
    <div className="flex min-h-0 flex-col overflow-hidden border-r border-border">
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-4 pb-6">
        <InfiniteTable
          data={list as WrappedAnalyticsListItemDto[]}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(row) => row.id}
          onRowClick={handleRowClick}
          getRowAriaLabel={(row) => `Open Wrapped report for ${row.projectName}`}
          rowInteractionRole="link"
          blankSlate="No Wrapped reports older than 7 days yet."
        />
      </div>
    </div>
  )
}

// ─── Stats column ───────────────────────────────────────────────────────────

function StatsColumn({
  stats,
  isLoading,
}: {
  readonly stats: WrappedAnalyticsPayloadDto["stats"] | undefined
  readonly isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Text.H6 color="foregroundMuted">Loading analytics…</Text.H6>
      </div>
    )
  }
  if (!stats) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Text.H6 color="foregroundMuted">No data.</Text.H6>
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <SummaryRow summary={stats.summary} />
      <PersonalityDistributionPanel data={stats.personalityDistribution} />
      <ScorePercentilesPanel rows={stats.scorePercentilesByKind} />
      <ToolMixBaselinePanel rows={stats.toolMixBaselineCheck} />
      <GatePassRatesPanel rows={stats.gatePassRates} />
      <ExcessHistogramsPanel histograms={stats.excessHistograms} />
    </div>
  )
}

function SummaryRow({ summary }: { readonly summary: WrappedAnalyticsPayloadDto["stats"]["summary"] }) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Reports", value: formatCount(summary.reports) },
    { label: "Projects", value: formatCount(summary.projects) },
    { label: "Organizations", value: formatCount(summary.organizations) },
    {
      label: "Window",
      value:
        summary.oldestCreatedAt && summary.newestCreatedAt
          ? `${relativeTime(new Date(summary.oldestCreatedAt))} → ${relativeTime(new Date(summary.newestCreatedAt))}`
          : "—",
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex flex-col gap-1 p-4">
            <Text.H6 color="foregroundMuted">{item.label}</Text.H6>
            <Text.H4 weight="semibold">
              <span className="tabular-nums">{item.value}</span>
            </Text.H4>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function PersonalityDistributionPanel({ data }: { readonly data: ReadonlyArray<PersonalityCountDto> }) {
  const total = data.reduce((acc, d) => acc + d.count, 0)
  const points: BarChartDataPoint[] = data.map((d) => ({
    category: TITLE_FOR_KIND[d.kind],
    value: d.count,
  }))
  const formatTooltip = (category: string, value: number) => {
    const pct = total === 0 ? 0 : (value / total) * 100
    return `${category}: ${formatCount(value)} (${pct.toFixed(1)}%)`
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Text.H5 weight="semibold">Personality distribution</Text.H5>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <BarChart
          data={points}
          height={220}
          xAxisLabelFontSize={11}
          formatTooltip={formatTooltip}
          ariaLabel="Personality distribution across reports"
        />
      </CardContent>
    </Card>
  )
}

function ScorePercentilesPanel({ rows }: { readonly rows: ReadonlyArray<PersonalityScoreRowDto> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Text.H5 weight="semibold">Score percentiles by personality</Text.H5>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Personality</TableHead>
              <TableHead className="text-right">n</TableHead>
              <TableHead className="text-right">p25</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p75</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Text.H6 color="foregroundMuted">No reports in the cohort.</Text.H6>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.kind}>
                  <TableCell>
                    <Text.H6>{TITLE_FOR_KIND[row.kind]}</Text.H6>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{formatCount(row.n)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{row.p25.toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{row.p50.toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{row.p75.toFixed(2)}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

const DRIFT_THRESHOLDS = { okay: 0.03, warn: 0.1 }

function ToolMixBaselinePanel({ rows }: { readonly rows: ReadonlyArray<ToolMixCheckRowDto> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Text.H5 weight="semibold">Tool-mix vs baseline</Text.H5>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead className="text-right">Baseline</TableHead>
              <TableHead className="text-right">p10</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p90</TableHead>
              <TableHead className="text-right">Drift (p50 − baseline)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const driftAbs = Math.abs(row.drift)
              const driftClass =
                driftAbs <= DRIFT_THRESHOLDS.okay
                  ? "text-emerald-600"
                  : driftAbs <= DRIFT_THRESHOLDS.warn
                    ? "text-amber-600"
                    : "text-rose-600"
              return (
                <TableRow key={row.bucket}>
                  <TableCell>
                    <Text.H6>{row.bucket}</Text.H6>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{row.baseline.toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{row.p10.toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{row.p50.toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums">{row.p90.toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`tabular-nums ${driftClass}`}>
                      {row.drift >= 0 ? "+" : ""}
                      {row.drift.toFixed(2)}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function GatePassRatesPanel({ rows }: { readonly rows: ReadonlyArray<GatePassRateRowDto> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Text.H5 weight="semibold">Conditional-gate pass-rates</Text.H5>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gate</TableHead>
              <TableHead className="text-right">Passes</TableHead>
              <TableHead className="text-right">Pass rate</TableHead>
              <TableHead className="text-right">Median signal (passers)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.kind}>
                <TableCell>
                  <Text.H6>{TITLE_FOR_KIND[row.kind]}</Text.H6>
                </TableCell>
                <TableCell className="text-right">
                  <span className="tabular-nums">{formatCount(row.passCount)}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="tabular-nums">{(row.passRate * 100).toFixed(1)}%</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="tabular-nums">
                    {row.medianSignal === null
                      ? "—"
                      : row.kind === "consultant" || row.kind === "shipper" || row.kind === "tester"
                        ? row.medianSignal.toFixed(2)
                        : `${(row.medianSignal * 100).toFixed(1)}pp`}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ExcessHistogramsPanel({ histograms }: { readonly histograms: ReadonlyArray<ExcessHistogramDto> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Text.H5 weight="semibold">Always-fires excess histograms</Text.H5>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 p-4 pt-0 sm:grid-cols-2">
        {histograms.map((h) => {
          const points: BarChartDataPoint[] = h.buckets.map((b) => ({
            category: bucketLabel(b.lower, b.upper),
            value: b.count,
          }))
          return (
            <div key={h.kind} className="flex flex-col gap-2">
              <Text.H6 weight="medium">{TITLE_FOR_KIND[h.kind]}</Text.H6>
              <BarChart
                data={points}
                height={140}
                xAxisLabelFontSize={10}
                ariaLabel={`Excess distribution for ${TITLE_FOR_KIND[h.kind]}`}
              />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

const bucketLabel = (lower: number, upper: number): string => {
  if (!Number.isFinite(lower)) return `< ${upper.toFixed(2)}`
  if (!Number.isFinite(upper)) return `≥ ${lower.toFixed(2)}`
  return `${lower.toFixed(2)}–${upper.toFixed(2)}`
}
