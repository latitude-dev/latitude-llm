import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  InfiniteTable,
  type InfiniteTableColumn,
  Text,
} from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useMemo, useState } from "react"
import { adminListWrappedAnalytics } from "../../domains/admin/wrapped-analytics.functions.ts"
import type {
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

  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    if (!data) return
    void navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [data])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <div className="flex flex-1 flex-col gap-1">
          <Text.H4 weight="semibold">Wrapped analytics</Text.H4>
          <Text.H6 color="foregroundMuted">
            Latest Wrapped report per project from the last 7 days. Click a row to open the report in a new tab.
          </Text.H6>
        </div>
        <Button variant="outline" size="sm" disabled={!data || isLoading} onClick={handleCopy}>
          {copied ? "Copied!" : "Copy JSON"}
        </Button>
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
        width: 230,
        render: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <Text.H6 color="foregroundMuted" noWrap className="w-7 shrink-0 text-right tabular-nums">
              {`#${row.rank}`}
            </Text.H6>
            <div className="flex min-w-0 flex-col leading-tight">
              <Text.H5 weight="medium" ellipsis noWrap>
                {row.projectName}
              </Text.H5>
              <Text.H6 color="foregroundMuted" ellipsis noWrap>
                {row.organizationName} · {row.ownerName}
              </Text.H6>
            </div>
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
        key: "tokensTotal",
        header: "Tokens",
        align: "end",
        minWidth: 90,
        width: 120,
        render: (row) => (
          <Text.H5 weight="medium" noWrap>
            <span className="tabular-nums">{row.tokensTotal !== null ? formatCount(row.tokensTotal) : "—"}</span>
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

  // The Wrapped page is a public surface, not part of the backoffice tree, so
  // rows open in a new tab via a plain anchor (no TanStack route navigation).
  const renderRowLink = useCallback(
    (row: WrappedAnalyticsListItemDto, props: { className: string }) => (
      <a
        href={`/wrapped/${row.id}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open Wrapped report for ${row.projectName}`}
        {...props}
      />
    ),
    [],
  )

  return (
    <div className="flex min-h-0 flex-col overflow-hidden border-r border-border">
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-4 pb-6">
        <InfiniteTable
          data={list as WrappedAnalyticsListItemDto[]}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(row) => row.id}
          renderRowLink={renderRowLink}
          blankSlate="No Wrapped reports older than 7 days yet."
        />
      </div>
    </div>
  )
}

// ─── Stats column (narrative report) ────────────────────────────────────────

/** Conditional archetypes require a usage-signal threshold gate to fire. */
const CONDITIONAL_KINDS = new Set(["strategist", "scholar", "consultant", "shipper", "tester"])

/** One-line description for each tool-mix bucket. */
const BUCKET_DESC: Record<string, string> = {
  bash: "Shell commands & scripts",
  read: "File reads",
  edit: "Line-level edits",
  write: "New file writes",
  search: "Grep / Glob / LS",
  research: "Web research",
  plan: "Task planning",
  other: "Other tools",
}

/** Classify a win-score (p50) into a human-readable strength label. */
const scoreStrengthLabel = (p50: number): string => {
  if (p50 >= 0.7) return "Strong"
  if (p50 >= 0.4) return "Moderate"
  return "Weak"
}

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
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <SummarySection summary={stats.summary} />
      <ArchetypesSection distribution={stats.personalityDistribution} scorePercentiles={stats.scorePercentilesByKind} />
      <ToolMixSection rows={stats.toolMixBaselineCheck} />
      <ConfidenceSection
        gates={stats.gatePassRates}
        distribution={stats.personalityDistribution}
        scorePercentiles={stats.scorePercentilesByKind}
      />
    </div>
  )
}

// ─── Section 1: Summary ──────────────────────────────────────────────────────

function SummarySection({ summary }: { readonly summary: WrappedAnalyticsPayloadDto["stats"]["summary"] }) {
  const windowLabel = (() => {
    if (!summary.oldestCreatedAt || !summary.newestCreatedAt) return "—"
    const oldest = new Date(summary.oldestCreatedAt)
    const newest = new Date(summary.newestCreatedAt)
    // Same UTC day → all reports from one batch, just show the date
    if (oldest.toISOString().slice(0, 10) === newest.toISOString().slice(0, 10)) {
      return oldest.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    }
    return `${relativeTime(oldest)} → ${relativeTime(newest)}`
  })()

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(
        [
          { label: "Reports", value: formatCount(summary.reports) },
          { label: "Projects", value: formatCount(summary.projects) },
          { label: "Organizations", value: formatCount(summary.organizations) },
          { label: "Date", value: windowLabel },
        ] as const
      ).map((item) => (
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

// ─── Section 2: Archetypes ───────────────────────────────────────────────────

function ArchetypesSection({
  distribution,
  scorePercentiles,
}: {
  readonly distribution: ReadonlyArray<PersonalityCountDto>
  readonly scorePercentiles: ReadonlyArray<PersonalityScoreRowDto>
}) {
  const total = distribution.reduce((acc, d) => acc + d.count, 0)
  const maxCount = Math.max(...distribution.map((d) => d.count), 1)
  const fired = [...distribution].filter((d) => d.count > 0).sort((a, b) => b.count - a.count)
  const silent = distribution.filter((d) => d.count === 0)
  const p50Map = new Map(scorePercentiles.map((r) => [r.kind, r.p50]))

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Text.H5 weight="semibold">This week's archetypes</Text.H5>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5 px-4 pb-4 pt-0">
        <Text.H6 color="foregroundMuted" className="mb-3 italic">
          How reports were classified. <span className="not-italic font-medium">Conditional</span> archetypes require a
          usage-signal threshold; <span className="not-italic font-medium">fallback</span> ones win by tool-mix excess
          when no conditional gate fires.
        </Text.H6>
        {fired.map((item, i) => {
          const pct = total === 0 ? 0 : item.count / total
          const fill = item.count / maxCount
          const isConditional = CONDITIONAL_KINDS.has(item.kind)
          const p50 = p50Map.get(item.kind)
          const strength = p50 !== undefined ? scoreStrengthLabel(p50) : null
          return (
            <div key={item.kind} className="flex items-center gap-2 py-1.5">
              <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <div className="w-36 shrink-0">
                <Text.H6 weight="medium" noWrap>
                  {TITLE_FOR_KIND[item.kind]}
                </Text.H6>
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none ${
                  isConditional
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {isConditional ? "conditional" : "fallback"}
              </span>
              <div className="flex-1 overflow-hidden rounded-full bg-border" style={{ height: 8 }}>
                <div
                  className={`h-full rounded-full ${isConditional ? "bg-blue-500" : "bg-slate-400"}`}
                  style={{ width: `${fill * 100}%` }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-sm tabular-nums font-medium">{item.count}</span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(pct * 100)}%
              </span>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{strength ?? ""}</span>
            </div>
          )
        })}
        {fired.length === 0 && (
          <Text.H6 color="foregroundMuted" className="py-4 text-center">
            No reports in this cohort.
          </Text.H6>
        )}
        {silent.length > 0 && (
          <Text.H6 color="foregroundMuted" className="mt-3 italic">
            0 reports: {silent.map((d) => TITLE_FOR_KIND[d.kind]).join(", ")}.
          </Text.H6>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Section 3: Tool mix ─────────────────────────────────────────────────────

function ToolMixSection({ rows }: { readonly rows: ReadonlyArray<ToolMixCheckRowDto> }) {
  const sorted = [...rows].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))

  const driftColor = (drift: number): string => {
    const abs = Math.abs(drift)
    if (abs > 0.1) return "text-rose-600"
    if (abs >= 0.05) return "text-amber-600"
    return "text-emerald-600"
  }

  const statusBadge = (drift: number): { label: string; cls: string } | null => {
    const abs = Math.abs(drift)
    if (abs > 0.1)
      return {
        label: "Retune",
        cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
      }
    if (abs >= 0.05)
      return {
        label: "Watch",
        cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      }
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Text.H5 weight="semibold">How people work</Text.H5>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 px-4 pb-4 pt-0">
        <Text.H6 color="foregroundMuted" className="mb-4 italic">
          Types of Claude Code tool calls this week, compared against our expected baselines. Large drift means
          personalities may be mis-assigned — a "Retune" row is the clearest signal to update the baseline.
        </Text.H6>
        <div className="flex flex-col gap-2">
          {sorted.map((row) => {
            const expectedPct = Math.round(row.baseline * 100)
            const sawPct = Math.round(row.p50 * 100)
            const driftPp = Math.round(Math.abs(row.drift) * 100)
            const badge = statusBadge(row.drift)
            return (
              <div key={row.bucket} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                <div className="w-32 shrink-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide">{row.bucket}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{BUCKET_DESC[row.bucket] ?? ""}</p>
                </div>
                <div className="flex flex-1 items-center gap-1.5">
                  <span className="tabular-nums text-sm text-muted-foreground">Expected {expectedPct}%</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="tabular-nums text-sm font-semibold">Saw {sawPct}%</span>
                </div>
                <span
                  className={`w-12 shrink-0 text-right tabular-nums text-sm font-semibold ${driftColor(row.drift)}`}
                >
                  {row.drift >= 0 ? "+" : "−"}
                  {driftPp}pp
                </span>
                <div className="w-14 shrink-0 text-right">
                  {badge && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] leading-none ${badge.cls}`}>{badge.label}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          pp = percentage points · Drift = p50 actual − expected baseline · Sorted by largest drift first
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Section 4: Confidence ───────────────────────────────────────────────────

function ConfidenceSection({
  gates,
  distribution,
  scorePercentiles,
}: {
  readonly gates: ReadonlyArray<GatePassRateRowDto>
  readonly distribution: ReadonlyArray<PersonalityCountDto>
  readonly scorePercentiles: ReadonlyArray<PersonalityScoreRowDto>
}) {
  const countMap = new Map(distribution.map((d) => [d.kind, d.count]))
  const p50Map = new Map(scorePercentiles.map((r) => [r.kind, r.p50]))

  const ALWAYS_FIRES = ["surgeon", "architect", "detective", "conductor"] as const
  const alwaysFired = ALWAYS_FIRES.filter((k) => (countMap.get(k) ?? 0) > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Text.H5 weight="semibold">Personality confidence</Text.H5>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 px-4 pb-4 pt-0">
        {/* 4A: Conditional gates */}
        <div className="flex flex-col gap-2">
          <Text.H6 color="foregroundMuted" className="italic">
            Conditional archetypes only fire when usage exceeds a threshold. "Won" means top-scoring overall; "passed"
            means the gate fired but it may have been outscored by another archetype.
          </Text.H6>
          {gates.map((gate) => {
            const won = countMap.get(gate.kind) ?? 0
            const passed = gate.passCount
            const neverWon = passed > 0 && won === 0
            return (
              <div key={gate.kind} className="flex items-center gap-3">
                <div className="w-32 shrink-0">
                  <Text.H6 weight="medium">{TITLE_FOR_KIND[gate.kind]}</Text.H6>
                </div>
                <div className="flex-1 overflow-hidden rounded-full bg-border" style={{ height: 8 }}>
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${gate.passRate * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {(gate.passRate * 100).toFixed(0)}%
                </span>
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {won} won / {passed} passed
                </span>
                {neverWon && (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    never won
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="h-px bg-border" />

        {/* 4B: Always-fires fallbacks */}
        <div className="flex flex-col gap-2">
          <Text.H6 color="foregroundMuted" className="italic">
            Fallback archetypes win when no conditional gate clears. A weak score here is healthy — it means the
            conditional archetypes are well-calibrated and winning cleanly.
          </Text.H6>
          {alwaysFired.length === 0 ? (
            <Text.H6 color="foregroundMuted">No fallback archetypes fired this week.</Text.H6>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {alwaysFired.map((kind) => {
                const count = countMap.get(kind) ?? 0
                const p50 = p50Map.get(kind)
                const strength = p50 !== undefined ? scoreStrengthLabel(p50) : null
                return (
                  <div key={kind} className="flex flex-col gap-1 rounded-lg border border-border p-3">
                    <Text.H6 weight="medium">{TITLE_FOR_KIND[kind]}</Text.H6>
                    <Text.H6 color="foregroundMuted">{formatCount(count)} reports</Text.H6>
                    {strength !== null && p50 !== undefined && (
                      <div className="flex items-baseline gap-1.5">
                        <Text.H6 weight="medium">{strength}</Text.H6>
                        <Text.H6 color="foregroundMuted" className="text-[11px]">
                          (p50: {p50.toFixed(2)})
                        </Text.H6>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
