import {
  type AssignPersonalityInput,
  BASELINE_SHARE,
  consultantGatePasses,
  PERSONALITY_KINDS,
  type PersonalityKind,
  type Report,
  scholarGatePasses,
  shipperGatePasses,
  strategistGatePasses,
  TOOL_BUCKETS,
  type ToolBucket,
  testerGatePasses,
  type WrappedReportRecord,
} from "@domain/spans"

const CONDITIONAL_KINDS = ["strategist", "scholar", "consultant", "shipper", "tester"] as const
type ConditionalKind = (typeof CONDITIONAL_KINDS)[number]

const ALWAYS_FIRES_KINDS = ["surgeon", "architect", "detective", "conductor"] as const
type AlwaysFiresKind = (typeof ALWAYS_FIRES_KINDS)[number]

/**
 * Histogram bucket boundaries for the "always-fires" archetypes (Surgeon /
 * Architect / Detective / Conductor). Each bucket is `[lower, upper)`; the
 * first catches everything below baseline (`< 0`) and the last catches
 * saturated values (`≥ 0.30`, where `normalise(_, 0, 0.3)` clamps to 1).
 */
const EXCESS_BUCKETS: ReadonlyArray<readonly [number, number]> = [
  [Number.NEGATIVE_INFINITY, 0],
  [0, 0.05],
  [0.05, 0.1],
  [0.1, 0.2],
  [0.2, 0.3],
  [0.3, Number.POSITIVE_INFINITY],
]

export interface WrappedAnalyticsListItemDto {
  readonly id: string
  readonly projectName: string
  readonly ownerName: string
  readonly organizationName: string
  readonly personalityKind: PersonalityKind
  readonly personalityScore: number
  readonly toolCalls: number
  readonly sessions: number
  readonly createdAt: string
}

export interface WrappedAnalyticsSummaryDto {
  readonly reports: number
  readonly projects: number
  readonly organizations: number
  readonly oldestCreatedAt: string | null
  readonly newestCreatedAt: string | null
}

export interface PersonalityCountDto {
  readonly kind: PersonalityKind
  readonly count: number
}

export interface PersonalityScoreRowDto {
  readonly kind: PersonalityKind
  readonly n: number
  readonly p25: number
  readonly p50: number
  readonly p75: number
}

export interface ToolMixCheckRowDto {
  readonly bucket: ToolBucket
  readonly baseline: number
  readonly p10: number
  readonly p50: number
  readonly p90: number
  readonly drift: number
}

export interface GatePassRateRowDto {
  readonly kind: ConditionalKind
  readonly passRate: number
  readonly passCount: number
  /** Median signal value among passers; `null` when no report passed. */
  readonly medianSignal: number | null
}

export interface ExcessHistogramBucketDto {
  readonly lower: number
  readonly upper: number
  readonly count: number
}

export interface ExcessHistogramDto {
  readonly kind: AlwaysFiresKind
  readonly buckets: ReadonlyArray<ExcessHistogramBucketDto>
}

export interface WrappedAnalyticsStatsDto {
  readonly summary: WrappedAnalyticsSummaryDto
  readonly personalityDistribution: ReadonlyArray<PersonalityCountDto>
  readonly scorePercentilesByKind: ReadonlyArray<PersonalityScoreRowDto>
  readonly toolMixBaselineCheck: ReadonlyArray<ToolMixCheckRowDto>
  readonly gatePassRates: ReadonlyArray<GatePassRateRowDto>
  readonly excessHistograms: ReadonlyArray<ExcessHistogramDto>
}

export interface WrappedAnalyticsPayloadDto {
  readonly list: ReadonlyArray<WrappedAnalyticsListItemDto>
  readonly stats: WrappedAnalyticsStatsDto
}

/**
 * Nearest-rank percentile. Inputs assumed numeric and finite; the caller
 * filters out empty arrays before this fn is invoked. Returns 0 for an
 * empty array as a defensive fallback so the DTO never carries `NaN`.
 */
const percentile = (sortedAsc: readonly number[], p: number): number => {
  if (sortedAsc.length === 0) return 0
  if (sortedAsc.length === 1) return sortedAsc[0] ?? 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor((sortedAsc.length - 1) * p))
  return sortedAsc[idx] ?? 0
}

const sumToolMix = (mix: Report["toolMix"]): number =>
  mix.bash + mix.read + mix.edit + mix.write + mix.search + mix.research + mix.plan + mix.other

const shareOf = (mix: Report["toolMix"], bucket: ToolBucket): number => {
  const total = sumToolMix(mix)
  return total === 0 ? 0 : mix[bucket] / total
}

const excessOf = (mix: Report["toolMix"], bucket: ToolBucket): number => shareOf(mix, bucket) - BASELINE_SHARE[bucket]

/**
 * Reconstruct an `AssignPersonalityInput` from a persisted `Report` so the
 * exported gate predicates can be replayed. The mapping mirrors the call
 * site in `build-report.ts:455`:
 *  - `editAdded` = `loc.added` (Edit / MultiEdit additions only)
 *  - `writeLines` = `loc.written - loc.added` (Write-content portion of the
 *    headline "lines written" number, since `written` includes both)
 */
const assignmentInputFromReport = (r: Report): AssignPersonalityInput => ({
  toolMix: r.toolMix,
  sessions: r.totals.sessions,
  filesTouched: r.totals.filesTouched,
  commandsRun: r.totals.commandsRun,
  commits: r.totals.commits,
  gitWriteOps: r.totals.gitWriteOps,
  testsRun: r.totals.testsRun,
  editAdded: r.loc.added,
  writeLines: Math.max(0, r.loc.written - r.loc.added),
  linesRead: r.loc.read,
})

/**
 * Signal value associated with each conditional archetype's gate — the
 * thing we'd want to show "median among passers" of. Mirrors what the
 * archetype's score formula reads in `assignPersonality`.
 */
const signalForGate = (kind: ConditionalKind, input: AssignPersonalityInput): number => {
  switch (kind) {
    case "strategist":
      return excessOf(input.toolMix, "plan")
    case "scholar":
      return excessOf(input.toolMix, "research")
    case "consultant":
      return input.sessions
    case "shipper": {
      const commitsPerSession = input.sessions > 0 ? input.commits / input.sessions : 0
      const writeOpsPerSession = input.sessions > 0 ? input.gitWriteOps / input.sessions : 0
      return Math.max(commitsPerSession, writeOpsPerSession)
    }
    case "tester":
      return input.sessions > 0 ? input.testsRun / input.sessions : 0
  }
}

const gatePredicates: Record<ConditionalKind, (input: AssignPersonalityInput) => boolean> = {
  strategist: strategistGatePasses,
  scholar: scholarGatePasses,
  consultant: consultantGatePasses,
  shipper: shipperGatePasses,
  tester: testerGatePasses,
}

const excessForAlwaysFires = (kind: AlwaysFiresKind, mix: Report["toolMix"]): number => {
  switch (kind) {
    case "surgeon":
      return excessOf(mix, "edit")
    case "architect":
      return excessOf(mix, "write")
    case "detective":
      return excessOf(mix, "read") + excessOf(mix, "search")
    case "conductor":
      return excessOf(mix, "bash")
  }
}

const histogramOf = (values: readonly number[]): ReadonlyArray<ExcessHistogramBucketDto> =>
  EXCESS_BUCKETS.map(([lower, upper]) => ({
    lower,
    upper,
    count: values.reduce((acc, v) => acc + (v >= lower && v < upper ? 1 : 0), 0),
  }))

/**
 * Pure rollup over a cohort of persisted Wrapped reports. Single pass over
 * the records, then per-stat sort/percentile work. Everything the
 * backoffice page renders is derived here — the page itself does no
 * additional math beyond formatting.
 */
export const buildAnalyticsPayload = (records: ReadonlyArray<WrappedReportRecord>): WrappedAnalyticsPayloadDto => {
  // Sort list by tool-call activity (desc) so the backoffice list opens on
  // the most active project. Make a shallow copy first — never mutate the
  // input array.
  const sortedByActivity = [...records].sort((a, b) => b.report.totals.toolCalls - a.report.totals.toolCalls)

  const list: WrappedAnalyticsListItemDto[] = sortedByActivity.map((r) => ({
    id: r.id,
    projectName: r.report.project.name,
    ownerName: r.ownerName,
    organizationName: r.report.organization.name,
    personalityKind: r.report.personality.kind,
    personalityScore: r.report.personality.score,
    toolCalls: r.report.totals.toolCalls,
    sessions: r.report.totals.sessions,
    createdAt: r.createdAt.toISOString(),
  }))

  // Summary card row.
  const orgIds = new Set<string>()
  const projectIds = new Set<string>()
  let oldest = Number.POSITIVE_INFINITY
  let newest = Number.NEGATIVE_INFINITY
  for (const r of records) {
    orgIds.add(r.organizationId)
    projectIds.add(r.projectId)
    const ts = r.createdAt.getTime()
    if (ts < oldest) oldest = ts
    if (ts > newest) newest = ts
  }
  const summary: WrappedAnalyticsSummaryDto = {
    reports: records.length,
    projects: projectIds.size,
    organizations: orgIds.size,
    oldestCreatedAt: Number.isFinite(oldest) ? new Date(oldest).toISOString() : null,
    newestCreatedAt: Number.isFinite(newest) ? new Date(newest).toISOString() : null,
  }

  // Personality distribution — count per canonical kind, zeros included so
  // missing archetypes still render a bar (height 0) in the chart.
  const kindCounts = new Map<PersonalityKind, number>(PERSONALITY_KINDS.map((k) => [k, 0]))
  for (const r of records) {
    kindCounts.set(r.report.personality.kind, (kindCounts.get(r.report.personality.kind) ?? 0) + 1)
  }
  const personalityDistribution: PersonalityCountDto[] = PERSONALITY_KINDS.map((kind) => ({
    kind,
    count: kindCounts.get(kind) ?? 0,
  }))

  // Score-by-kind percentiles — only kinds with ≥1 report appear.
  const scoresByKind = new Map<PersonalityKind, number[]>()
  for (const r of records) {
    const arr = scoresByKind.get(r.report.personality.kind) ?? []
    arr.push(r.report.personality.score)
    scoresByKind.set(r.report.personality.kind, arr)
  }
  const scorePercentilesByKind: PersonalityScoreRowDto[] = PERSONALITY_KINDS.flatMap((kind) => {
    const scores = scoresByKind.get(kind)
    if (!scores || scores.length === 0) return []
    const sorted = [...scores].sort((a, b) => a - b)
    return [
      {
        kind,
        n: sorted.length,
        p25: percentile(sorted, 0.25),
        p50: percentile(sorted, 0.5),
        p75: percentile(sorted, 0.75),
      },
    ]
  })

  // Tool-mix baseline check — per-project share of each bucket, then percentile.
  const sharesByBucket = new Map<ToolBucket, number[]>(TOOL_BUCKETS.map((b) => [b, []]))
  for (const r of records) {
    for (const bucket of TOOL_BUCKETS) {
      sharesByBucket.get(bucket)?.push(shareOf(r.report.toolMix, bucket))
    }
  }
  const toolMixBaselineCheck: ToolMixCheckRowDto[] = TOOL_BUCKETS.map((bucket) => {
    const shares = sharesByBucket.get(bucket) ?? []
    const sorted = [...shares].sort((a, b) => a - b)
    const p50 = percentile(sorted, 0.5)
    return {
      bucket,
      baseline: BASELINE_SHARE[bucket],
      p10: percentile(sorted, 0.1),
      p50,
      p90: percentile(sorted, 0.9),
      drift: p50 - BASELINE_SHARE[bucket],
    }
  })

  // Conditional gate pass-rates.
  const inputsByRecord = records.map((r) => assignmentInputFromReport(r.report))
  const gatePassRates: GatePassRateRowDto[] = CONDITIONAL_KINDS.map((kind) => {
    const passers: number[] = []
    for (const input of inputsByRecord) {
      if (gatePredicates[kind](input)) passers.push(signalForGate(kind, input))
    }
    const sortedSignals = [...passers].sort((a, b) => a - b)
    return {
      kind,
      passCount: passers.length,
      passRate: records.length === 0 ? 0 : passers.length / records.length,
      medianSignal: passers.length === 0 ? null : percentile(sortedSignals, 0.5),
    }
  })

  // Always-fires excess histograms.
  const excessHistograms: ExcessHistogramDto[] = ALWAYS_FIRES_KINDS.map((kind) => ({
    kind,
    buckets: histogramOf(records.map((r) => excessForAlwaysFires(kind, r.report.toolMix))),
  }))

  return {
    list,
    stats: {
      summary,
      personalityDistribution,
      scorePercentilesByKind,
      toolMixBaselineCheck,
      gatePassRates,
      excessHistograms,
    },
  }
}
