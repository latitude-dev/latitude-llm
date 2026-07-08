import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError, ValidationError } from "@domain/shared"
import { DEFAULT_ESCALATION_SENSITIVITY } from "@domain/shared"
import { Context, Effect, Layer } from "effect"
import type { EntrySignalsSnapshot } from "./entities/incident.ts"
import type { SeasonalSeriesSignals, SeriesReaderShape } from "./ports/series-reader.ts"
import { SeriesReader } from "./ports/series-reader.ts"

export const DEFAULT_ESCALATION_SENSITIVITY_K = DEFAULT_ESCALATION_SENSITIVITY
export const ESCALATION_MIN_OCCURRENCES_THRESHOLD = 20
export const ESCALATION_EXIT_THRESHOLD_FACTOR = 0.7
export const MIN_SEASONAL_SAMPLES = 2
export const ESCALATION_EXIT_DWELL_MS = 30 * 60 * 1000
export const ESCALATION_ABSOLUTE_RATE_EXIT_FACTOR = 0.5
export const ESCALATION_MAX_DURATION_MS = 72 * 60 * 60 * 1000

const BACKTRACK_WINDOW_MS = 24 * 60 * 60 * 1000
const BACKTRACK_BUCKET_SECONDS = 60 * 60

const sigmaEffective = (observed: number, expected: number): number =>
  Math.max(observed, Math.sqrt(Math.max(0, expected)), 1.0)

export const seasonalAnomalyThreshold = (expected: number, stddev: number, k: number): number =>
  expected + k * sigmaEffective(stddev, expected)

const snapshotFromSignals = (
  signals: SeasonalSeriesSignals,
  kShort: number,
  kLong: number,
  entryThreshold1h: number,
  entryThreshold6hPerHour: number,
): EntrySignalsSnapshot => ({
  expected1h: signals.expected1h,
  expected6hPerHour: signals.expected6hPerHour,
  stddev1h: signals.stddev1h,
  stddev6hPerHour: signals.stddev6hPerHour,
  kShort,
  kLong,
  entryThreshold1h,
  entryThreshold6hPerHour,
  entryCount24h: signals.recent24h,
})

export type EscalationTransition = "enter" | "exit" | "none"
export type EscalationExitReason = "threshold" | "absolute-rate-drop" | "timeout" | "resolved" | "ignored"

export interface EscalationDecisionInput {
  readonly signals: SeasonalSeriesSignals
  readonly kShort: number
  readonly isNew: boolean
  readonly wasEscalating: boolean
  readonly entrySignals: EntrySignalsSnapshot | null
  readonly startedAt: Date | null
  readonly exitEligibleSince: Date | null
  readonly now: Date
}

export interface EscalationDecision {
  readonly transition: EscalationTransition
  readonly reason?: EscalationExitReason
  readonly entrySignalsSnapshot?: EntrySignalsSnapshot
  readonly nextExitEligibleSince: Date | null
}

export const evaluateSeasonalEscalation = (input: EscalationDecisionInput): EscalationDecision => {
  const { signals, kShort, isNew, wasEscalating, entrySignals, startedAt, exitEligibleSince, now } = input

  if (isNew) return { transition: "none", nextExitEligibleSince: null }

  if (wasEscalating && startedAt !== null && now.getTime() - startedAt.getTime() >= ESCALATION_MAX_DURATION_MS) {
    return { transition: "exit", reason: "timeout", nextExitEligibleSince: null }
  }

  const kAdj = signals.samplesCount < MIN_SEASONAL_SAMPLES ? kShort + 1 : kShort
  const kLong = Math.max(1, kAdj - 1)
  const sigma1h = sigmaEffective(signals.stddev1h, signals.expected1h)
  const sigma6hPerHour = sigmaEffective(signals.stddev6hPerHour, signals.expected6hPerHour)
  const recent6hPerHour = signals.recent6h / 6
  const entryBand1h = seasonalAnomalyThreshold(signals.expected1h, signals.stddev1h, kAdj)
  const entryBand6hPerHour = seasonalAnomalyThreshold(signals.expected6hPerHour, signals.stddev6hPerHour, kLong)
  const exitBand1h = signals.expected1h + ESCALATION_EXIT_THRESHOLD_FACTOR * kAdj * sigma1h
  const exitBand6hPerHour = signals.expected6hPerHour + ESCALATION_EXIT_THRESHOLD_FACTOR * kLong * sigma6hPerHour

  if (!wasEscalating) {
    if (signals.samplesCount === 0) {
      const floor1h = ESCALATION_MIN_OCCURRENCES_THRESHOLD / 6
      if (signals.recent6h >= ESCALATION_MIN_OCCURRENCES_THRESHOLD && signals.recent1h >= floor1h) {
        return {
          transition: "enter",
          entrySignalsSnapshot: snapshotFromSignals(signals, kShort, Math.max(1, kShort - 1), 0, 0),
          nextExitEligibleSince: null,
        }
      }
      return { transition: "none", nextExitEligibleSince: null }
    }

    if (signals.recent1h > entryBand1h && recent6hPerHour > entryBand6hPerHour) {
      return {
        transition: "enter",
        entrySignalsSnapshot: snapshotFromSignals(signals, kShort, kLong, entryBand1h, entryBand6hPerHour),
        nextExitEligibleSince: null,
      }
    }
    return { transition: "none", nextExitEligibleSince: null }
  }

  if (entrySignals !== null && signals.recent24h < entrySignals.entryCount24h * ESCALATION_ABSOLUTE_RATE_EXIT_FACTOR) {
    return { transition: "exit", reason: "absolute-rate-drop", nextExitEligibleSince: null }
  }

  const exitShapeHolds = signals.recent1h < exitBand1h && recent6hPerHour < exitBand6hPerHour
  if (!exitShapeHolds) return { transition: "none", nextExitEligibleSince: null }
  if (exitEligibleSince === null) return { transition: "none", nextExitEligibleSince: now }
  if (now.getTime() - exitEligibleSince.getTime() >= ESCALATION_EXIT_DWELL_MS) {
    return { transition: "exit", reason: "threshold", nextExitEligibleSince: null }
  }
  return { transition: "none", nextExitEligibleSince: exitEligibleSince }
}

export interface EscalationEngineInput extends Omit<EscalationDecisionInput, "signals"> {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sourceId: string
}

export interface EscalationEngineDecision extends EscalationDecision {
  readonly transitionAt: Date | null
}

const backtrack = (reader: SeriesReaderShape, input: EscalationEngineInput, direction: "start" | "end") =>
  Effect.gen(function* () {
    const to = input.now
    const from = new Date(to.getTime() - BACKTRACK_WINDOW_MS)
    const { counts, thresholds } = yield* reader.readCrossingBuckets({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceId: input.sourceId,
      from,
      to,
      bucketSeconds: BACKTRACK_BUCKET_SECONDS,
      kShort: input.kShort,
    })
    const thresholdByBucket = new Map<string, number>()
    for (const entry of thresholds) {
      if (Number.isFinite(entry.thresholdCount)) thresholdByBucket.set(entry.bucket, entry.thresholdCount)
    }
    const ordered = [...counts].sort((a, b) => a.bucket.localeCompare(b.bucket))
    const buckets = direction === "start" ? ordered : [...ordered].reverse()
    for (const bucket of buckets) {
      const threshold = thresholdByBucket.get(bucket.bucket)
      if (threshold !== undefined && bucket.count >= threshold) {
        const timestamp = new Date(bucket.bucket)
        if (!Number.isNaN(timestamp.getTime())) return timestamp
      }
    }
    return input.now
  })

export interface EscalationEngineShape {
  evaluate(
    input: EscalationEngineInput,
  ): Effect.Effect<EscalationEngineDecision, RepositoryError | ValidationError, SeriesReader | ChSqlClient>
}

export class EscalationEngine extends Context.Service<EscalationEngine, EscalationEngineShape>()(
  "@domain/incidents/EscalationEngine",
) {}

export const makeEscalationEngine = (): EscalationEngineShape => ({
  evaluate: (input) =>
    Effect.gen(function* () {
      const reader = yield* SeriesReader
      const signals = yield* reader.readSeasonalSeries({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourceId: input.sourceId,
        now: input.now,
      })
      if (signals === null) return { transition: "none", nextExitEligibleSince: null, transitionAt: null }
      const decision = evaluateSeasonalEscalation({ ...input, signals })
      if (decision.transition === "enter") {
        const transitionAt = yield* backtrack(reader, input, "start")
        return { ...decision, transitionAt }
      }
      if (decision.transition === "exit") {
        const transitionAt = yield* backtrack(reader, input, "end")
        return { ...decision, transitionAt }
      }
      return { ...decision, transitionAt: null }
    }),
})

export const EscalationEngineLive = Layer.succeed(EscalationEngine, makeEscalationEngine())
