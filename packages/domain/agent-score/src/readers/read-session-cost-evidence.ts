import type { MemoryEvent } from "@domain/memories"
import type { ScoreDimension } from "@domain/shared"
import {
  buildSessionCriticalPath,
  CACHE_MIN_CACHEABLE_INPUT_TOKENS,
  cacheCeilingRate,
  isLlmCompletionOperation,
  latencyInputBucket,
  latencyInputTokens,
  latencyOutputTokens,
  marginalCriticalPathNs,
  modelRegistryPricing,
  type SessionCriticalPath,
  type SessionGenerationFact,
  type SessionToolCallFact,
  USAGE_OPERATIONS,
} from "@domain/spans"
import type { CostMetricReading } from "../entities/cost-metric-reading.ts"
import {
  excessGenerationNs,
  excessTtftNs,
  type LatencyReferenceArtifact,
  lookupThroughputExpectationTps,
  lookupTtftExpectationNs,
} from "../entities/latency-reference-artifact.ts"
import type { AssessmentReaderFact } from "../entities/session-assessment-input.ts"
import type { CostFamilyDenominators } from "../scoring/aggregate-session-cost.ts"
import {
  composeSpeedCounterfactual,
  type SpeedAvoidableClaim,
  type SpeedCounterfactual,
} from "../scoring/compose-speed-counterfactual.ts"
import { buildSessionContentLedger, type SessionContentLedger, type TokenCounter } from "./cost/content-atom-ledger.ts"
import { readCacheGap, type SessionCacheEvidence } from "./cost/read-cache-gap.ts"
import { type RedundantAtomClaim, readAvoidablePressure, readRedundantInputShare } from "./cost/read-context-metrics.ts"
import { readNoopRewrites, readRepeatedZeroHits, readRevertedWrites } from "./cost/read-memory-metrics.ts"
import { type AttributableSpendClaim, readRecoverableSpend } from "./cost/read-recoverable-spend.ts"
import { type RecoveredIncident, readRecoveredIncidentRate, recoverySpendClaims } from "./cost/read-recovery-metrics.ts"
import { readSessionSpendCoverage, type SessionSpendCoverage } from "./cost/read-spend-coverage.ts"
import {
  type RecoveredStructuralDefect,
  readDeadSurface,
  readRepeatedCalls,
  readStructuralDefects,
  readThrashing,
  type ToolDefinitionSurface,
} from "./cost/read-tool-metrics.ts"

export interface SessionCostEvidenceInput {
  readonly generations: readonly SessionGenerationFact[]
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly memoryEvents: readonly MemoryEvent[]
  readonly countTokens: TokenCounter
  readonly completed: boolean | null
  readonly recoveredIncidents: readonly RecoveredIncident[]
  readonly recoveredStructuralDefects: readonly RecoveredStructuralDefect[]
  readonly toolDefinitions: readonly ToolDefinitionSurface[]
  readonly unmatchedToolCallNames: readonly string[]
  readonly cacheEvidence: SessionCacheEvidence | null
  readonly latencyArtifact?: LatencyReferenceArtifact
}

export interface SessionCostEvidence {
  readonly readings: readonly CostMetricReading[]
  /** The session's comparable-workload key, which is the matched signal estimator's match key. */
  readonly workloadStratum: string
  readonly denominators: CostFamilyDenominators
  readonly spendCoverage: SessionSpendCoverage
  readonly ledger: SessionContentLedger
  readonly criticalPath: SessionCriticalPath
  readonly speed: SpeedCounterfactual
  readonly readers: readonly AssessmentReaderFact[]
  readonly observedMicrocents: number
}

const COST_DIMENSIONS: readonly ScoreDimension[] = ["cost"]
const SPEED_DIMENSIONS: readonly ScoreDimension[] = ["speed"]

const memoryOperationCount = (events: readonly MemoryEvent[]): number =>
  events.filter((event) => event.changeKind !== "store_create" && event.changeKind !== "store_delete").length

/**
 * Which atoms another reader established as redundant, so the context readers penalize only those.
 *
 * A repeated tool call's payload is the one link PR 3 can prove: the call was redundant, therefore
 * the copy of its result riding in every later prompt was too. Nothing else claims redundancy yet,
 * which is why raw prompt size stays display-only.
 */
const redundantAtomClaims = ({
  toolCalls,
  repeatedCalls,
  ledger,
}: {
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly repeatedCalls: CostMetricReading
  readonly ledger: SessionContentLedger
}): RedundantAtomClaim[] => {
  const repeatedCallSpanIds = new Set(
    repeatedCalls.observations
      .filter((observation) => observation.adverseUnits > 0)
      .map((observation) => observation.atomId),
  )
  const redundantToolCallIds = new Set(
    toolCalls
      .filter((call) => repeatedCallSpanIds.has(`toolCall:${call.traceId}:${call.spanId}`))
      .map((call) => call.toolCallId)
      .filter((toolCallId) => toolCallId !== ""),
  )

  return [...ledger.atomsById.values()]
    .filter((atom) => atom.toolCallId !== undefined && redundantToolCallIds.has(atom.toolCallId))
    .map((atom) => ({ atomId: atom.atomId, cause: "tools.repeated_call" }))
}

/**
 * Cache lifetime the session-level ceiling assumes, in seconds.
 *
 * Five minutes is the documented default for the providers that publish one. Spans cannot say which
 * lifetime a provider actually ran, which is exactly why the evidence this produces is
 * cadence-only: it bounds the shortfall from above rather than measuring it.
 */
export const SESSION_CACHE_LIFETIME_SECONDS = 300

const usageOperations: ReadonlySet<string> = new Set(USAGE_OPERATIONS)

/**
 * The session's comparable-workload key.
 *
 * The dominant provider and model rather than every one of them: a session that called a small model
 * once mid-way is still the same kind of work, and a key that changed with every incidental call
 * would put every session in a stratum of its own and leave the matched estimator nothing to compare.
 * A session with no readable generation gets an explicit unknown key rather than an empty one, so it
 * only ever matches other unknowns.
 */
const workloadStratumOf = (generations: readonly SessionGenerationFact[]): string => {
  const completions = generations.filter((generation) => isLlmCompletionOperation(generation.operation))
  if (completions.length === 0) return "unknown"

  const byCalls = new Map<string, number>()
  let inputTokens = 0
  let streaming = 0
  for (const generation of completions) {
    const pair = `${generation.provider}/${generation.model}`
    byCalls.set(pair, (byCalls.get(pair) ?? 0) + 1)
    inputTokens += latencyInputTokens(generation.tokens)
    if (generation.isStreaming) streaming += 1
  }
  const dominant = [...byCalls.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0]
  const bucket = latencyInputBucket(Math.round(inputTokens / completions.length))
  const mode = streaming * 2 >= completions.length ? "streaming" : "buffered"
  const scale = completions.length <= 2 ? "short" : completions.length <= 10 ? "medium" : "long"
  return `${dominant?.[0] ?? "unknown"}|${bucket}|${mode}|${scale}`
}

/**
 * One generation's latency evidence, and whether the frozen reference could speak to it.
 *
 * Coverage is returned beside the claims because an absent reference produces no claim, and a
 * reader that contributes nothing and says nothing is indistinguishable from a generation that was
 * exactly on time. `notStreaming` is the one gap that is not a coverage failure: first-token timing
 * collapses into total duration without streaming, so there is nothing there to have measured.
 */
interface LatencyReaderCoverage {
  readonly applicable: number
  readonly readable: number
}

interface LatencyEvidence {
  readonly claims: readonly SpeedAvoidableClaim[]
  readonly ttft: LatencyReaderCoverage
  readonly throughput: LatencyReaderCoverage
}

const readLatencyEvidence = ({
  generations,
  artifact,
}: {
  readonly generations: readonly SessionGenerationFact[]
  readonly artifact: LatencyReferenceArtifact | undefined
}): LatencyEvidence => {
  const completions = generations.filter((generation) => isLlmCompletionOperation(generation.operation))
  if (!artifact) {
    // Every streaming completion could have been compared and none was, which is unmeasured Speed
    // evidence rather than clean Speed evidence.
    return {
      claims: [],
      ttft: { applicable: completions.filter((generation) => generation.isStreaming).length, readable: 0 },
      throughput: { applicable: completions.length, readable: 0 },
    }
  }

  const claims: SpeedAvoidableClaim[] = []
  let ttftApplicable = 0
  let ttftReadable = 0
  let throughputApplicable = 0
  let throughputReadable = 0

  for (const generation of completions) {
    const inputTokens = latencyInputTokens(generation.tokens)
    const outputTokens = latencyOutputTokens(generation.tokens)
    const ttftExpectation = lookupTtftExpectationNs({
      artifact,
      provider: generation.provider,
      model: generation.model,
      inputTokens,
      isStreaming: generation.isStreaming,
    })
    const throughputExpectation = lookupThroughputExpectationTps({
      artifact,
      provider: generation.provider,
      model: generation.model,
      inputTokens,
      outputTokens,
      isStreaming: generation.isStreaming,
    })

    if (!(ttftExpectation.provenance === "unmeasured" && ttftExpectation.reason === "notStreaming")) {
      ttftApplicable += 1
      if (ttftExpectation.provenance !== "unmeasured") ttftReadable += 1
    }
    throughputApplicable += 1
    if (throughputExpectation.provenance !== "unmeasured") throughputReadable += 1

    const ttftNs = excessTtftNs({ observedTtftNs: generation.timeToFirstTokenNs, expectation: ttftExpectation })
    const generationNs = excessGenerationNs({
      observedGenerationNs: Math.max(0, generation.durationNs - generation.timeToFirstTokenNs),
      outputTokens,
      expectation: throughputExpectation,
    })
    const removedNs = ttftNs + generationNs
    if (removedNs <= 0) continue
    claims.push({
      traceId: generation.traceId,
      spanId: generation.spanId,
      cause:
        ttftNs > 0 && generationNs > 0 ? "latency:ttft+throughput" : ttftNs > 0 ? "latency:ttft" : "latency:throughput",
      removedNs,
      evidence: "modeled" as const,
    })
  }

  return {
    claims,
    ttft: { applicable: ttftApplicable, readable: ttftReadable },
    throughput: { applicable: throughputApplicable, readable: throughputReadable },
  }
}

const recoverySpeedClaims = ({
  incidents,
  criticalPath,
}: {
  readonly incidents: readonly RecoveredIncident[]
  readonly criticalPath: SessionCriticalPath
}): SpeedAvoidableClaim[] => {
  const pathsByTrace = new Map(criticalPath.traces.map((path) => [path.traceId, path]))
  return incidents.flatMap((incident) => {
    const path = pathsByTrace.get(incident.traceId)
    if (!path || path.completeness === "notApplicable") return []
    return incident.retrySpanIds.map((spanId) => ({
      traceId: incident.traceId,
      spanId,
      cause: `recovered:${incident.kind}`,
      removedNs: marginalCriticalPathNs({ path, spanId }),
      evidence: "confirmed" as const,
    }))
  })
}

/**
 * The session's own cache cadence, as an upper bound.
 *
 * Two calls to the same model inside the assumed lifetime *could* have shared a warm prefix, so the
 * later one's input counts as achievable. Whether they really shared a prefix needs the prompts,
 * which is why the basis is `cadenceOnly` and the reader turns it into a bound with a zero floor
 * rather than a measured gap.
 */
export const buildSessionCacheEvidence = (
  generations: readonly SessionGenerationFact[],
): SessionCacheEvidence | null => {
  const priced = generations.filter(
    (generation) => usageOperations.has(generation.operation) && generation.provider !== "" && generation.model !== "",
  )
  if (priced.length === 0) return null

  const inputTokensOf = (generation: SessionGenerationFact): number =>
    generation.tokens.tokensInput + generation.tokens.tokensCacheRead + generation.tokens.tokensCacheCreate
  const eligible = priced.filter((generation) => inputTokensOf(generation) >= CACHE_MIN_CACHEABLE_INPUT_TOKENS)
  if (eligible.length === 0) return null

  const ordered = [...eligible].sort((left, right) => left.startTime.getTime() - right.startTime.getTime())
  const lastByModel = new Map<string, number>()
  let cacheableTokens = 0
  let warmTokens = 0
  for (const generation of ordered) {
    const key = `${generation.provider} ${generation.model}`
    const tokens = inputTokensOf(generation)
    cacheableTokens += tokens
    const previous = lastByModel.get(key)
    if (previous !== undefined && generation.startTime.getTime() - previous <= SESSION_CACHE_LIFETIME_SECONDS * 1_000) {
      warmTokens += tokens
    }
    lastByModel.set(key, generation.startTime.getTime())
  }

  const ceilingRate = cacheCeilingRate({ cacheableTokens, warmTokens })
  if (ceilingRate === null) return null
  const pricing = modelRegistryPricing({
    provider: ordered[0]?.provider ?? "",
    model: ordered[0]?.model ?? "",
  })

  return {
    cacheEligibleCallCount: eligible.length,
    averageInputTokens: cacheableTokens / eligible.length,
    achievableCacheTokens: warmTokens,
    observedCacheReadTokens: eligible.reduce((total, generation) => total + generation.tokens.tokensCacheRead, 0),
    basis: "cadenceOnly",
    cacheReadPriced: (pricing?.cacheRead ?? 0) > 0,
  }
}

const coverageFact = ({
  readerId,
  label,
  scoreDimensions,
  applicable,
  readableCount,
  totalCount,
  limitation,
}: {
  readonly readerId: string
  readonly label: string
  readonly scoreDimensions: readonly ScoreDimension[]
  readonly applicable: boolean
  readonly readableCount: number
  readonly totalCount: number
  readonly limitation?: AssessmentReaderFact["limitation"]
}): AssessmentReaderFact => ({
  readerId,
  label,
  scoreDimensions,
  applicable,
  findingCount: 0,
  readableCount,
  totalCount,
  ...(limitation !== undefined ? { limitation } : {}),
})

/**
 * A latency reader's coverage. Unreadable means the frozen reference had nothing for the cohort,
 * which is a missing reference and not missing telemetry: the span is complete, the comparison is
 * what is absent.
 */
const latencyCoverageFact = ({
  readerId,
  label,
  coverage,
}: {
  readonly readerId: string
  readonly label: string
  readonly coverage: LatencyReaderCoverage
}): AssessmentReaderFact =>
  coverageFact({
    readerId,
    label,
    scoreDimensions: SPEED_DIMENSIONS,
    applicable: coverage.applicable > 0,
    readableCount: coverage.readable,
    totalCount: coverage.applicable,
    ...(coverage.readable < coverage.applicable ? { limitation: "missingLatencyReference" as const } : {}),
  })

/**
 * Every Cost and Speed reading for one session, plus the coverage each reader could achieve.
 *
 * This is the one place the compact source facts, the content ledger, the critical path and the
 * readers meet, so the interactive panel and the benchmark batch see identical evidence — they call
 * this, not their own copies of it.
 */
export const readSessionCostEvidence = (input: SessionCostEvidenceInput): SessionCostEvidence => {
  const spendCoverage = readSessionSpendCoverage(input.generations)
  const ledger = buildSessionContentLedger({ generations: input.generations, countTokens: input.countTokens })
  const criticalPath = buildSessionCriticalPath({ spans: input.generations })

  const repeatedCalls = readRepeatedCalls(input.toolCalls)
  const thrashing = readThrashing(input.toolCalls)
  const structuralDefects = readStructuralDefects({
    calls: input.toolCalls,
    recoveredDefects: input.recoveredStructuralDefects,
    structureCaptured: input.toolCalls.length > 0,
  })
  const redundantClaims = redundantAtomClaims({ toolCalls: input.toolCalls, repeatedCalls, ledger })

  const spendClaims: AttributableSpendClaim[] = recoverySpendClaims({
    recovered: input.recoveredIncidents,
    generations: input.generations,
  })
  const readings: CostMetricReading[] = [
    readRecoverableSpend({ generations: input.generations, coverage: spendCoverage, claims: spendClaims }),
    readCacheGap({ generations: input.generations, evidence: input.cacheEvidence }),
    readRedundantInputShare({ ledger, claims: redundantClaims }),
    readAvoidablePressure({ ledger, claims: redundantClaims }),
    readDeadSurface({
      definitions: input.toolDefinitions,
      readableInputTokens: ledger.readableInputTokens,
      unmatchedCallNames: input.unmatchedToolCallNames,
    }),
    repeatedCalls,
    thrashing,
    structuralDefects,
    readRepeatedZeroHits(input.memoryEvents),
    readNoopRewrites(input.memoryEvents),
    readRevertedWrites(input.memoryEvents),
    readRecoveredIncidentRate({ completed: input.completed, recovered: input.recoveredIncidents }),
  ]

  const latency = readLatencyEvidence({ generations: input.generations, artifact: input.latencyArtifact })
  const speed = composeSpeedCounterfactual({
    criticalPath,
    claims: [...recoverySpeedClaims({ incidents: input.recoveredIncidents, criticalPath }), ...latency.claims],
  })

  const contentLimitation = ledger.unreadableGenerationCount > 0 ? ("missingContent" as const) : undefined
  const llmGenerations = input.generations.filter((generation) => isLlmCompletionOperation(generation.operation))
  const unknownContextCount = llmGenerations.filter((generation) => generation.modelContextLimitTokens === null).length

  return {
    readings,
    workloadStratum: workloadStratumOf(input.generations),
    denominators: {
      spend: spendCoverage.pricedMicrocents,
      context: ledger.readableInputTokens,
      tools: input.toolCalls.length,
      memory: memoryOperationCount(input.memoryEvents),
      recovery: input.completed === true ? 1 : 0,
    },
    spendCoverage,
    ledger,
    criticalPath,
    speed,
    observedMicrocents: spendCoverage.pricedMicrocents,
    readers: [
      coverageFact({
        readerId: "cost.pricing_coverage",
        label: "Spend pricing",
        scoreDimensions: COST_DIMENSIONS,
        applicable: spendCoverage.spendBearingCallCount > 0,
        readableCount: spendCoverage.pricedCallCount + spendCoverage.knownFreeCallCount,
        totalCount: spendCoverage.spendBearingCallCount,
        ...(spendCoverage.complete ? {} : { limitation: "missingPricing" as const }),
      }),
      coverageFact({
        readerId: "context.content_capture",
        label: "Captured model input",
        scoreDimensions: COST_DIMENSIONS,
        applicable: ledger.readableGenerationCount + ledger.unreadableGenerationCount > 0,
        readableCount: ledger.readableGenerationCount,
        totalCount: ledger.readableGenerationCount + ledger.unreadableGenerationCount,
        ...(contentLimitation !== undefined ? { limitation: contentLimitation } : {}),
      }),
      coverageFact({
        readerId: "context.model_limits",
        label: "Known model context limits",
        scoreDimensions: COST_DIMENSIONS,
        applicable: llmGenerations.length > 0,
        readableCount: llmGenerations.length - unknownContextCount,
        totalCount: llmGenerations.length,
        ...(unknownContextCount > 0 ? { limitation: "unknownModelContext" as const } : {}),
      }),
      coverageFact({
        readerId: "speed.critical_path",
        label: "Critical-path reconstruction",
        scoreDimensions: SPEED_DIMENSIONS,
        applicable: criticalPath.traces.length > 0,
        readableCount: criticalPath.completeTraceCount,
        totalCount: criticalPath.completeTraceCount + criticalPath.incompleteTraceCount,
        ...(criticalPath.completeness === "complete" ? {} : { limitation: "criticalPathUnavailable" as const }),
      }),
      latencyCoverageFact({
        readerId: "spans.ttft",
        label: "Time to first token",
        coverage: latency.ttft,
      }),
      latencyCoverageFact({
        readerId: "spans.throughput",
        label: "Generation throughput",
        coverage: latency.throughput,
      }),
    ],
  }
}
