import { SCORE_DIMENSIONS, type ScoreDimension } from "@domain/shared"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostMetricCatalog } from "../entities/cost-metric-catalog.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import { attributeDeficit, type CauseAttribution, type DeficitAttribution } from "./attribute-deficit.ts"
import type { WindowFold } from "./fold-window-contributions.ts"
import { survivalOverReferenceRun } from "./reference-run.ts"
import type { ReliabilitySessionEndpoint } from "./select-reliability-endpoints.ts"

/**
 * Whether a row may say the cause produced the effect, or only that the two occur together.
 *
 * A metric that identified avoidable work or a terminal failure observed it. A signal fitted against
 * matched clean sessions found an association, and the page has to say so: an observational estimate
 * that survives matching is still not an experiment.
 */
export type CauseEvidenceKind = "measured" | "associated"

/**
 * The product section that owns a cause, so a row leads somewhere that can act on it.
 *
 * The same vocabulary the catalog already uses for Cost metrics, because the benchmark ranks a
 * consequence and the section that owns the evidence is where somebody goes to do something about
 * it. `page.md` fixes the mapping; nothing here invents a destination a section cannot show.
 */
export const CAUSE_DESTINATIONS = ["sessions", "tools", "memory", "cost", "signals"] as const
export type CauseDestination = (typeof CAUSE_DESTINATIONS)[number]

/**
 * Where a Speed claim or a terminal finding leads.
 *
 * Cost causes are metric ids and take their destination from the catalog entry that defined them.
 * These two have no catalog row: a Speed claim is named by the reader that produced it, and a
 * Reliability cause is the finding kind that ended the session. A cause with no entry here gets no
 * link at all, which is the honest default — a wrong destination wastes more of somebody's time
 * than an absent one.
 */
const DESTINATION_BY_CAUSE: Readonly<Record<string, CauseDestination>> = {
  // Speed claim causes, as `composeSpeedCounterfactual` names them.
  "latency:ttft": "sessions",
  "latency:throughput": "sessions",
  "latency:ttft+throughput": "sessions",
  "tools.repeated_call": "tools",
  "tools.thrashing": "tools",
  "tools.structural_defect": "tools",
  "memory.repeated_zero_hit": "memory",
  "recovery.provider_retry": "sessions",
  "recovery.tool_retry": "tools",
  // Reliability causes, which are the finding kinds that end a session.
  noOutput: "sessions",
  outputDamage: "sessions",
  finishFailure: "sessions",
  providerError: "sessions",
  toolFailure: "tools",
  toolStructuralDefect: "tools",
}

/** A section the interface can actually open, or nothing. `sessionAssessment` is not a section. */
const asCauseDestination = (destination: string): CauseDestination | undefined =>
  (CAUSE_DESTINATIONS as readonly string[]).includes(destination) ? (destination as CauseDestination) : undefined

const destinationForMetric = ({
  metricId,
  catalog,
}: {
  readonly metricId: string
  readonly catalog: CostMetricCatalog | undefined
}): CauseDestination | undefined => {
  const entry = catalog?.entries.find((candidate) => candidate.metricId === metricId)
  // The catalog lists every section a metric belongs on, most specific first; the first one the
  // interface can open is the one the row leads to.
  const fromCatalog = entry?.destinations.flatMap((destination) => asCauseDestination(destination) ?? [])
  return fromCatalog?.[0] ?? DESTINATION_BY_CAUSE[metricId]
}

export interface DimensionCauseRow extends CauseAttribution {
  readonly scoreDimension: ScoreDimension
  readonly label: string
  readonly evidence: CauseEvidenceKind
  /** The cause's effect in the dimension's own unit, before it became score points. */
  readonly nativeEffect: { readonly value: number; readonly unit: string }
  readonly signalId?: string
  /** Independent observations behind the row, which is the reader's count and never a score. */
  readonly observationCount: number
  /** The section that owns this evidence. Absent when nothing can usefully be opened. */
  readonly destination?: CauseDestination
}

export interface DimensionAttribution {
  readonly scoreDimension: ScoreDimension
  readonly rows: readonly DimensionCauseRow[]
  readonly residual: number
  readonly totalDeficit: number
  /** What the cause model alone accounts for; above the total when the model is the coarser view. */
  readonly explainedDeficit: number
  readonly method: DeficitAttribution["method"]
  readonly approximationError?: number
}

const attributionOf = ({
  scoreDimension,
  attribution,
  describe,
}: {
  readonly scoreDimension: ScoreDimension
  readonly attribution: DeficitAttribution
  readonly describe: (causeId: string) => Omit<DimensionCauseRow, keyof CauseAttribution | "scoreDimension">
}): DimensionAttribution => ({
  scoreDimension,
  rows: attribution.causes
    .map((cause): DimensionCauseRow => ({ ...cause, scoreDimension, ...describe(cause.causeId) }))
    .sort((left, right) => right.attributedDeficit - left.attributedDeficit),
  residual: attribution.residual,
  totalDeficit: attribution.totalDeficit,
  explainedDeficit: attribution.explainedDeficit,
  method: attribution.method,
  ...(attribution.approximationError !== undefined ? { approximationError: attribution.approximationError } : {}),
})

/**
 * Cost attributed in each family's own units before any of it becomes score points.
 *
 * A metric's claim is penalized units against its family's eligible units, and only the family
 * weights and caps turn that into points. Attributing in points first would make the answer depend
 * on the weights twice, and would lose the number the page actually shows beside the row: tokens,
 * calls, operations, or money.
 */
export const attributeCostWindow = ({
  fold,
  artifact,
  catalog,
  observedScore,
  residualSignalPenalty = 0,
  seed,
}: {
  readonly fold: WindowFold
  readonly artifact: CostScoringArtifact
  readonly catalog?: CostMetricCatalog
  readonly observedScore: number
  readonly residualSignalPenalty?: number
  readonly seed?: number
}): DimensionAttribution => {
  const eligibleByFamily = Object.fromEntries(
    COST_FAMILIES.map((family) => [
      family,
      fold.contributions.reduce(
        (total, contribution) =>
          total + (contribution.families.find((entry) => entry.family === family)?.eligibleUnits ?? 0),
        0,
      ),
    ]),
  ) as Record<CostFamily, number>

  const causeIds = [...fold.costCauseUnits.keys()]
  const scoreWith = (active: ReadonlySet<string>): number => {
    const penalized = Object.fromEntries(COST_FAMILIES.map((family) => [family, 0])) as Record<CostFamily, number>
    for (const causeId of active) {
      const cause = fold.costCauseUnits.get(causeId)
      if (cause) penalized[cause.family] += cause.penalizedUnits
    }
    const weighted = COST_FAMILIES.reduce((total, family) => {
      const eligible = eligibleByFamily[family]
      const share = eligible > 0 ? Math.min(1, penalized[family] / eligible) : 0
      return total + artifact.familyWeights[family] * Math.min(artifact.familyCaps[family], share)
    }, 0)
    return 100 * (1 - Math.max(0, Math.min(1, weighted + residualSignalPenalty)))
  }

  return attributionOf({
    scoreDimension: "cost",
    attribution: attributeDeficit({
      causeIds,
      scoreWith,
      healthyScore: 100,
      observedScore,
      ...(seed !== undefined ? { seed } : {}),
    }),
    describe: (causeId) => {
      const cause = fold.costCauseUnits.get(causeId)
      const destination = destinationForMetric({ metricId: causeId, catalog })
      return {
        label: causeId,
        evidence: "measured",
        nativeEffect: { value: cause?.penalizedUnits ?? 0, unit: cause?.family ?? "units" },
        observationCount: fold.foldedSessionCount,
        ...(destination ? { destination } : {}),
      }
    },
  })
}

/**
 * Speed attributed in nanoseconds before the ratio, for the same reason Cost is attributed in units.
 */
export const attributeSpeedWindow = ({
  fold,
  observedNs,
  observedScore,
  residualAvoidableNs = 0,
  seed,
}: {
  readonly fold: WindowFold
  readonly observedNs: number
  readonly observedScore: number
  readonly residualAvoidableNs?: number
  readonly seed?: number
}): DimensionAttribution => {
  const causeIds = [...fold.speedCauseNs.keys()]
  const scoreWith = (active: ReadonlySet<string>): number => {
    if (observedNs <= 0) return 100
    const avoidable = [...active].reduce((total, causeId) => total + (fold.speedCauseNs.get(causeId) ?? 0), 0)
    return 100 * (1 - Math.min(1, (avoidable + Math.max(0, residualAvoidableNs)) / observedNs))
  }

  return attributionOf({
    scoreDimension: "speed",
    attribution: attributeDeficit({
      causeIds,
      scoreWith,
      healthyScore: 100,
      observedScore,
      ...(seed !== undefined ? { seed } : {}),
    }),
    describe: (causeId) => {
      const destination = DESTINATION_BY_CAUSE[causeId]
      return {
        label: causeId,
        evidence: "measured",
        nativeEffect: { value: fold.speedCauseNs.get(causeId) ?? 0, unit: "nanoseconds" },
        observationCount: fold.foldedSessionCount,
        ...(destination ? { destination } : {}),
      }
    },
  })
}

/**
 * Reliability attributed over the sessions each cause actually ended.
 *
 * Terminal findings do not add up: a session that hit both a provider error and a failed tool call
 * is ended by either, so the characteristic function counts sessions rather than summing causes, and
 * Shapley is what splits the overlap. Sessions are grouped by their cause set first, so the
 * thousands of them collapse to a handful of distinct patterns and every subset costs a few
 * comparisons instead of a full pass.
 */
export const attributeReliabilityWindow = ({
  endpoints,
  referenceRunSessions,
  observedScore,
  seed,
}: {
  readonly endpoints: readonly ReliabilitySessionEndpoint[]
  readonly referenceRunSessions: number
  readonly observedScore: number
  readonly seed?: number
}): DimensionAttribution => {
  const readable = endpoints.filter((endpoint) => endpoint.readable)
  const patterns = new Map<string, { readonly causes: readonly string[]; count: number }>()
  const sessionsByCause = new Map<string, number>()
  for (const endpoint of readable) {
    if (endpoint.causes.length === 0) continue
    const causes = [...endpoint.causes].sort()
    const key = causes.join("|")
    const pattern = patterns.get(key) ?? { causes, count: 0 }
    pattern.count += 1
    patterns.set(key, pattern)
    for (const cause of causes) sessionsByCause.set(cause, (sessionsByCause.get(cause) ?? 0) + 1)
  }

  const causeIds = [...sessionsByCause.keys()]
  const scoreWith = (active: ReadonlySet<string>): number => {
    if (readable.length === 0) return 100
    let failed = 0
    for (const pattern of patterns.values()) {
      if (pattern.causes.some((cause) => active.has(cause))) failed += pattern.count
    }
    return survivalOverReferenceRun({ adverseRate: failed / readable.length, referenceRunSessions })
  }

  return attributionOf({
    scoreDimension: "reliability",
    attribution: attributeDeficit({
      causeIds,
      scoreWith,
      healthyScore: 100,
      observedScore,
      ...(seed !== undefined ? { seed } : {}),
    }),
    describe: (causeId) => {
      const destination = DESTINATION_BY_CAUSE[causeId]
      return {
        label: causeId,
        evidence: "measured",
        nativeEffect: { value: sessionsByCause.get(causeId) ?? 0, unit: "sessions" },
        observationCount: sessionsByCause.get(causeId) ?? 0,
        ...(destination ? { destination } : {}),
      }
    },
  })
}

export const EMPTY_DIMENSION_ATTRIBUTION = (scoreDimension: ScoreDimension): DimensionAttribution => ({
  scoreDimension,
  rows: [],
  residual: 0,
  totalDeficit: 0,
  explainedDeficit: 0,
  method: "exact",
})

export const ATTRIBUTED_DIMENSIONS: readonly ScoreDimension[] = SCORE_DIMENSIONS.filter(
  (dimension) => dimension === "reliability" || dimension === "cost" || dimension === "speed",
)
