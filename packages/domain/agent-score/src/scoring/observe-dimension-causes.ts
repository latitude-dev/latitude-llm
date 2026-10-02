import type { ScoreDimension } from "@domain/shared"
import { CAUSE_EXAMPLE_SESSION_LIMIT } from "../constants.ts"
import type { CostMetricCatalog } from "../entities/cost-metric-catalog.ts"
import {
  type CauseDestination,
  type CauseEvidenceKind,
  destinationForCause,
  destinationForMetric,
} from "./attribute-dimensions.ts"
import type { SessionSignalEvidence, WindowSignalEffects } from "./build-window-signal-effects.ts"
import type { WindowFold } from "./fold-window-contributions.ts"
import type { ReliabilitySessionEndpoint } from "./select-reliability-endpoints.ts"

export type ObservedCauseMeasurement = CauseEvidenceKind | "notMeasured"

export interface ObservedDimensionCause {
  readonly scoreDimension: ScoreDimension
  readonly causeId: string
  readonly label: string
  readonly measurement: ObservedCauseMeasurement
  readonly nativeEffect: { readonly value: number; readonly unit: string }
  readonly observationCount: number
  readonly signalId?: string
  readonly destination?: CauseDestination
  /** Sessions somebody can open to see the cause, capped at `CAUSE_EXAMPLE_SESSION_LIMIT`. */
  readonly exampleSessionIds?: readonly string[]
}

const measuredCause = ({
  scoreDimension,
  causeId,
  value,
  unit,
  observationCount,
  destination,
  exampleSessionIds,
}: {
  readonly scoreDimension: ScoreDimension
  readonly causeId: string
  readonly value: number
  readonly unit: string
  readonly observationCount: number
  readonly destination?: CauseDestination | undefined
  readonly exampleSessionIds?: readonly string[] | undefined
}): ObservedDimensionCause => ({
  scoreDimension,
  causeId,
  label: causeId,
  measurement: "measured",
  nativeEffect: { value, unit },
  observationCount,
  ...(destination ? { destination } : {}),
  ...(exampleSessionIds?.length ? { exampleSessionIds } : {}),
})

const deterministicCauses = ({
  fold,
  reliabilityEndpoints,
  catalog,
}: {
  readonly fold: WindowFold
  readonly reliabilityEndpoints: readonly ReliabilitySessionEndpoint[]
  readonly catalog: CostMetricCatalog
}): ObservedDimensionCause[] => {
  const causes: ObservedDimensionCause[] = []
  const reliabilityCounts = new Map<string, number>()
  const reliabilityExamples = new Map<string, string[]>()
  for (const endpoint of reliabilityEndpoints) {
    for (const causeId of new Set(endpoint.causes)) {
      reliabilityCounts.set(causeId, (reliabilityCounts.get(causeId) ?? 0) + 1)
      const examples = reliabilityExamples.get(causeId) ?? []
      if (examples.length < CAUSE_EXAMPLE_SESSION_LIMIT) examples.push(endpoint.sessionId)
      reliabilityExamples.set(causeId, examples)
    }
  }
  for (const [causeId, count] of reliabilityCounts) {
    causes.push(
      measuredCause({
        scoreDimension: "reliability",
        causeId,
        value: count,
        unit: "sessions",
        observationCount: count,
        destination: destinationForCause(causeId),
        exampleSessionIds: reliabilityExamples.get(causeId),
      }),
    )
  }
  for (const [causeId, cause] of fold.costCauseUnits) {
    causes.push(
      measuredCause({
        scoreDimension: "cost",
        causeId,
        value: cause.penalizedUnits,
        unit: cause.family,
        observationCount: fold.foldedSessionCount,
        destination: destinationForMetric({ metricId: causeId, catalog }),
      }),
    )
  }
  for (const [causeId, avoidableNs] of fold.speedCauseNs) {
    causes.push(
      measuredCause({
        scoreDimension: "speed",
        causeId,
        value: avoidableNs,
        unit: "nanoseconds",
        observationCount: fold.foldedSessionCount,
        destination: destinationForCause(causeId),
      }),
    )
  }
  return causes
}

interface SignalAccumulator {
  readonly label: string
  readonly scoreDimensions: Set<ScoreDimension>
  readonly sessionIds: Set<string>
}

const signalMeasurement = ({
  signalId,
  scoreDimension,
  effects,
}: {
  readonly signalId: string
  readonly scoreDimension: ScoreDimension
  readonly effects: WindowSignalEffects
}): ObservedCauseMeasurement => {
  if (scoreDimension === "cost" && effects.linkedSignalIds.includes(signalId)) return "measured"
  if (scoreDimension === "cost" && effects.costResiduals.some((residual) => residual.signalId === signalId)) {
    return "associated"
  }
  if (scoreDimension === "speed" && effects.speedResiduals.some((residual) => residual.signalId === signalId)) {
    return "associated"
  }
  return "notMeasured"
}

const signalCauses = ({
  evidence,
  effects,
}: {
  readonly evidence: readonly SessionSignalEvidence[]
  readonly effects: WindowSignalEffects
}): ObservedDimensionCause[] => {
  const signals = new Map<string, SignalAccumulator>()
  for (const session of evidence) {
    for (const signal of session.signals) {
      const current = signals.get(signal.signalId) ?? {
        label: signal.label,
        scoreDimensions: new Set<ScoreDimension>(),
        sessionIds: new Set<string>(),
      }
      current.sessionIds.add(session.sessionId)
      for (const dimension of signal.scoreDimensions) current.scoreDimensions.add(dimension)
      signals.set(signal.signalId, current)
    }
  }

  return [...signals.entries()].flatMap(([signalId, signal]) =>
    [...signal.scoreDimensions]
      .filter((dimension) => dimension !== "outcome" && dimension !== "safety")
      .map(
        (scoreDimension): ObservedDimensionCause => ({
          scoreDimension,
          causeId: `signal:${signalId}`,
          label: signal.label,
          measurement: signalMeasurement({ signalId, scoreDimension, effects }),
          nativeEffect: { value: signal.sessionIds.size, unit: "sessions" },
          observationCount: signal.sessionIds.size,
          signalId,
          destination: "signals",
        }),
      ),
  )
}

export const observeDimensionCauses = ({
  fold,
  reliabilityEndpoints,
  signalEvidence,
  signalEffects,
  catalog,
}: {
  readonly fold: WindowFold
  readonly reliabilityEndpoints: readonly ReliabilitySessionEndpoint[]
  readonly signalEvidence: readonly SessionSignalEvidence[]
  readonly signalEffects: WindowSignalEffects
  readonly catalog: CostMetricCatalog
}): readonly ObservedDimensionCause[] =>
  [
    ...deterministicCauses({ fold, reliabilityEndpoints, catalog }),
    ...signalCauses({ evidence: signalEvidence, effects: signalEffects }),
  ].sort((left, right) => right.observationCount - left.observationCount)
