import type { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { Effect } from "effect"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostMetricCatalog } from "../entities/cost-metric-catalog.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import type { LatencyReferenceArtifact } from "../entities/latency-reference-artifact.ts"
import type { NormalizedSessionAssessmentInput } from "../entities/session-assessment-input.ts"
import { readSessionAssessmentInputBatch } from "../readers/read-session-assessment-batch.ts"
import { type CostFamilyDenominators, EMPTY_COST_FAMILY_DENOMINATORS } from "../scoring/aggregate-session-cost.ts"
import {
  aggregateWindowCost,
  aggregateWindowSpeed,
  bootstrapWindow,
  type SessionWindowContribution,
  type WindowBootstrapResult,
  type WindowCostAggregate,
  type WindowSpeedAggregate,
} from "../scoring/bootstrap-window.ts"
import { EMPTY_WINDOW_FOLD, foldWindowBatch, type WindowFold } from "../scoring/fold-window-contributions.ts"

/**
 * How many sessions one shadow batch reads.
 *
 * The batch is the unit of residency: it is read, folded to a handful of numbers per session, and
 * released before the next one starts, so a thousand-session window never has a thousand sessions
 * resident. Deliberately smaller than the window so the fold is exercised rather than skipped.
 */
export const SHADOW_BATCH_SIZE = 50

/**
 * Counters the runtime owns, sampled around each batch.
 *
 * Injected rather than read here because query counts, rows and bytes read live in the ClickHouse
 * client and heap size lives in the host runtime, and a domain use-case can reach neither. A caller
 * that supplies no probe still gets timings, coverage and distributions; it just cannot report the
 * resource figures.
 */
export interface ShadowResourceSample {
  readonly queryCount?: number
  readonly rowsRead?: number
  readonly bytesRead?: number
  readonly heapUsedBytes?: number
}

export interface ShadowResourceProbe {
  readonly sample: () => ShadowResourceSample
}

export interface CostSpeedShadowInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** The window's eligible sessions, already selected. Processed in deterministic batch order. */
  readonly sessionIds: readonly SessionId[]
  readonly cutoff: Date
  readonly artifact: CostScoringArtifact
  readonly latencyArtifact: LatencyReferenceArtifact
  readonly catalog: CostMetricCatalog
  readonly batchSize?: number
  readonly bootstrapReplicates?: number
  readonly bootstrapSeed?: number
  readonly probe?: ShadowResourceProbe
}

export interface ShadowResourceReport {
  readonly resolverMs: number
  readonly slowestBatchMs: number
  readonly queryCount?: number
  readonly rowsRead?: number
  readonly bytesRead?: number
  readonly peakHeapUsedBytes?: number
}

/** Deciles of a family's per-session penalty share, which is a ratio and never a session score. */
export interface ShadowFamilyDistribution {
  readonly family: CostFamily
  readonly sessionCount: number
  readonly deciles: readonly number[]
}

export interface CostSpeedShadowReport {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly cutoff: Date
  readonly artifactVersion: string
  readonly catalogVersion: string
  readonly requestedSessionCount: number
  readonly readSessionCount: number
  readonly batchCount: number
  readonly fold: WindowFold
  readonly cost: WindowCostAggregate
  readonly speed: WindowSpeedAggregate
  readonly interval: WindowBootstrapResult
  /** Readable share of applicable metric readings, per family, across the whole window. */
  readonly familyCoverage: Readonly<Record<string, number>>
  readonly familyDistributions: readonly ShadowFamilyDistribution[]
  readonly resources: ShadowResourceReport
}

/**
 * The denominators the session's own readers agreed on, so a shadow run scores exactly what the
 * session panel shows. A session read before the Cost readers existed has none, which is zero
 * eligible units in every family: no penalty and no denominator.
 */
const denominatorsOf = (session: NormalizedSessionAssessmentInput): CostFamilyDenominators =>
  session.costEvidence?.denominators ?? EMPTY_COST_FAMILY_DENOMINATORS

const batched = <Value>(values: readonly Value[], size: number): Value[][] => {
  const batches: Value[][] = []
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size))
  }
  return batches
}

interface CoverageTally {
  readonly applicable: Map<string, number>
  readonly readable: Map<string, number>
}

const emptyCoverageTally = (): CoverageTally => ({ applicable: new Map(), readable: new Map() })

/**
 * Coverage counted as batches land, so the readings never have to stay resident.
 *
 * Two counters per family rather than a running share: shares cannot be added, and the window's
 * coverage is the pooled ratio over every applicable reading in it.
 */
const tallyCoverage = (tally: CoverageTally, sessions: readonly NormalizedSessionAssessmentInput[]): void => {
  for (const session of sessions) {
    for (const reading of session.costEvidence?.readings ?? []) {
      if (reading.applicability !== "applicable") continue
      tally.applicable.set(reading.family, (tally.applicable.get(reading.family) ?? 0) + 1)
      if (reading.readability === "readable") {
        tally.readable.set(reading.family, (tally.readable.get(reading.family) ?? 0) + 1)
      }
    }
  }
}

const coverageShares = (tally: CoverageTally): Record<string, number> =>
  Object.fromEntries(
    [...tally.applicable.entries()].map(([family, total]) => [
      family,
      total > 0 ? (tally.readable.get(family) ?? 0) / total : 0,
    ]),
  )

const decilesOf = (values: readonly number[]): number[] => {
  const sorted = [...values].sort((left, right) => left - right)
  if (sorted.length === 0) return []
  return Array.from({ length: 11 }, (_, step) => {
    const position = Math.min(sorted.length - 1, Math.max(0, Math.round((step / 10) * (sorted.length - 1))))
    return sorted[position] as number
  })
}

/**
 * How each family's penalty share is spread across the window's sessions.
 *
 * Deliberately per-family ratios and not per-session Cost scores: a session never receives a 0-100
 * Cost score, and a calibration instrument is not the place to start. These are the distributions a
 * curve, a cap and a coverage floor get chosen against.
 */
const familyDistributionsOf = (contributions: readonly SessionWindowContribution[]): ShadowFamilyDistribution[] =>
  COST_FAMILIES.map((family) => {
    const shares = contributions.flatMap((contribution) =>
      contribution.families.flatMap((entry) =>
        entry.family === family && entry.eligibleUnits > 0 ? [entry.penalizedUnits / entry.eligibleUnits] : [],
      ),
    )
    return { family, sessionCount: shares.length, deciles: decilesOf(shares) }
  })

const resourcesOf = ({
  samples,
  resolverMs,
  slowestBatchMs,
}: {
  readonly samples: readonly ShadowResourceSample[]
  readonly resolverMs: number
  readonly slowestBatchMs: number
}): ShadowResourceReport => {
  const first = samples.at(0)
  const last = samples.at(-1)
  const delta = (field: "queryCount" | "rowsRead" | "bytesRead"): number | undefined => {
    const before = first?.[field]
    const after = last?.[field]
    return before !== undefined && after !== undefined ? after - before : undefined
  }
  const heaps = samples.flatMap((sample) => (sample.heapUsedBytes !== undefined ? [sample.heapUsedBytes] : []))
  const queryCount = delta("queryCount")
  const rowsRead = delta("rowsRead")
  const bytesRead = delta("bytesRead")
  return {
    resolverMs,
    slowestBatchMs,
    ...(queryCount !== undefined ? { queryCount } : {}),
    ...(rowsRead !== undefined ? { rowsRead } : {}),
    ...(bytesRead !== undefined ? { bytesRead } : {}),
    ...(heaps.length > 0 ? { peakHeapUsedBytes: Math.max(...heaps) } : {}),
  }
}

/**
 * Reads a whole window and reports what Cost and Speed would say, writing nothing.
 *
 * This is the calibration instrument, not a scoring job: no snapshot, no score row, no published
 * number. It exists so family weights, curves, caps and coverage floors can be chosen against real
 * traffic instead of guessed, and so the cost of doing that at window scale is measured before
 * anything depends on it.
 *
 * Deterministic by construction — batches in session order, a seeded bootstrap, coverage pooled
 * rather than averaged — so a rerun over the same window and artifact reproduces the same report
 * apart from its timings. That equality is the check that the pipeline carries no hidden state.
 */
export const runCostSpeedShadow = Effect.fn("agentScore.runCostSpeedShadow")(function* (input: CostSpeedShadowInput) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("shadow.sessionCount", input.sessionIds.length)

  const batchSize = input.batchSize ?? SHADOW_BATCH_SIZE
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    return yield* Effect.die(new RangeError("batchSize must be a positive integer"))
  }
  const batches = batched(input.sessionIds, batchSize)
  const coverage = emptyCoverageTally()
  const samples: ShadowResourceSample[] = input.probe ? [input.probe.sample()] : []
  let fold: WindowFold = EMPTY_WINDOW_FOLD
  let readSessionCount = 0
  let resolverMs = 0
  let slowestBatchMs = 0

  for (const sessionIds of batches) {
    const startedAt = performance.now()
    const sessions = yield* readSessionAssessmentInputBatch({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sessionIds,
      cutoff: input.cutoff,
      latencyArtifact: input.latencyArtifact,
    })
    readSessionCount += sessions.length
    tallyCoverage(coverage, sessions)
    fold = foldWindowBatch({
      fold,
      sessions,
      denominatorsFor: denominatorsOf,
      artifact: input.artifact,
      catalog: input.catalog,
    })
    const batchMs = performance.now() - startedAt
    resolverMs += batchMs
    slowestBatchMs = Math.max(slowestBatchMs, batchMs)
    if (input.probe) samples.push(input.probe.sample())
  }

  yield* Effect.annotateCurrentSpan("shadow.batchCount", batches.length)
  yield* Effect.annotateCurrentSpan("shadow.withheldSessionCount", fold.withheldSessionCount)

  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    cutoff: input.cutoff,
    artifactVersion: input.artifact.artifactVersion,
    catalogVersion: input.catalog.catalogVersion,
    requestedSessionCount: input.sessionIds.length,
    readSessionCount,
    batchCount: batches.length,
    fold,
    cost: aggregateWindowCost({ contributions: fold.contributions, artifact: input.artifact }),
    speed: aggregateWindowSpeed(fold.contributions),
    interval: bootstrapWindow({
      contributions: fold.contributions,
      artifact: input.artifact,
      ...(input.bootstrapReplicates !== undefined ? { replicates: input.bootstrapReplicates } : {}),
      ...(input.bootstrapSeed !== undefined ? { seed: input.bootstrapSeed } : {}),
    }),
    familyCoverage: coverageShares(coverage),
    familyDistributions: familyDistributionsOf(fold.contributions),
    resources: resourcesOf({ samples, resolverMs, slowestBatchMs }),
  } satisfies CostSpeedShadowReport
})
