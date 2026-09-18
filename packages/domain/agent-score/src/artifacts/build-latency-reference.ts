import { LATENCY_INPUT_BUCKETS, LATENCY_OUTPUT_BUCKETS } from "@domain/spans"
import type {
  LatencyReferenceArtifact,
  ThroughputReferenceCohort,
  TtftReferenceCohort,
} from "../entities/latency-reference-artifact.ts"

/**
 * One candidate cohort reading from the cross-organisation aggregation.
 *
 * Structurally the admin port's `FleetLatencyCohortSample`, declared here so the builder stays a
 * pure function and `@domain/agent-score` never gains a path to a cross-tenant repository. The
 * wiring site depends on both and is where the two shapes have to agree.
 */
export interface LatencyCohortSample {
  readonly provider: string
  readonly model: string
  readonly inputBucket: string | null
  readonly outputBucket: string | null
  readonly streaming: boolean | null
  readonly sampleCount: number
  readonly organizationCount: number
  readonly median: number
}

export const LATENCY_SAMPLE_REJECTIONS = [
  "belowSampleCount",
  "belowTenantSpread",
  "unknownBucket",
  "nonStreamingTtft",
  "nonPositiveMedian",
] as const
export type LatencySampleRejection = (typeof LATENCY_SAMPLE_REJECTIONS)[number]

export interface LatencyReferenceBuildReport {
  readonly artifact: LatencyReferenceArtifact
  readonly ttftCohortCount: number
  readonly throughputCohortCount: number
  /** Why samples were dropped, so a thin freeze is explainable rather than merely small. */
  readonly rejected: Readonly<Record<LatencySampleRejection, number>>
}

const emptyRejections = (): Record<LatencySampleRejection, number> => ({
  belowSampleCount: 0,
  belowTenantSpread: 0,
  unknownBucket: 0,
  nonStreamingTtft: 0,
  nonPositiveMedian: 0,
})

const isInputBucket = (value: string): value is (typeof LATENCY_INPUT_BUCKETS)[number] =>
  (LATENCY_INPUT_BUCKETS as readonly string[]).includes(value)

const isOutputBucket = (value: string): value is (typeof LATENCY_OUTPUT_BUCKETS)[number] =>
  (LATENCY_OUTPUT_BUCKETS as readonly string[]).includes(value)

/** A roll-up row carries no bucket and no mode; anything else is a full cohort row. */
const isProviderModelRollUp = (sample: LatencyCohortSample): boolean => !sample.inputBucket && sample.streaming === null

interface GateContext {
  readonly minimumSampleCount: number
  readonly minimumOrganizationCount: number
  readonly rejected: Record<LatencySampleRejection, number>
}

const passesGates = (sample: LatencyCohortSample, context: GateContext): boolean => {
  if (!(sample.median > 0)) {
    context.rejected.nonPositiveMedian += 1
    return false
  }
  if (sample.sampleCount < context.minimumSampleCount) {
    context.rejected.belowSampleCount += 1
    return false
  }
  if (sample.organizationCount < context.minimumOrganizationCount) {
    context.rejected.belowTenantSpread += 1
    return false
  }
  return true
}

const toTtftCohort = (sample: LatencyCohortSample, context: GateContext): TtftReferenceCohort | null => {
  if (!passesGates(sample, context)) return null
  const base = {
    provider: sample.provider,
    model: sample.model,
    sampleCount: sample.sampleCount,
    organizationCount: sample.organizationCount,
    medianTtftNs: sample.median,
  }
  if (isProviderModelRollUp(sample)) return { ...base, granularity: "providerModel" }
  // Non-streaming first-token timing collapses into total duration, so it has no reference to be.
  if (sample.streaming !== true) {
    context.rejected.nonStreamingTtft += 1
    return null
  }
  if (!sample.inputBucket || !isInputBucket(sample.inputBucket)) {
    context.rejected.unknownBucket += 1
    return null
  }
  return { ...base, granularity: "cohort", inputBucket: sample.inputBucket, streaming: true }
}

const toThroughputCohort = (sample: LatencyCohortSample, context: GateContext): ThroughputReferenceCohort | null => {
  if (!passesGates(sample, context)) return null
  const base = {
    provider: sample.provider,
    model: sample.model,
    sampleCount: sample.sampleCount,
    organizationCount: sample.organizationCount,
    medianTokensPerSecond: sample.median,
  }
  if (isProviderModelRollUp(sample)) return { ...base, granularity: "providerModel" }
  if (
    !sample.inputBucket ||
    !isInputBucket(sample.inputBucket) ||
    !sample.outputBucket ||
    !isOutputBucket(sample.outputBucket)
  ) {
    context.rejected.unknownBucket += 1
    return null
  }
  return {
    ...base,
    granularity: "cohort",
    inputBucket: sample.inputBucket,
    outputBucket: sample.outputBucket,
    streaming: sample.streaming === true,
  }
}

/**
 * Turns cross-organisation cohort samples into the frozen reference Speed reads.
 *
 * Pure and deterministic, so the same closed window and the same gates reproduce the same artifact,
 * which is what makes a freeze reviewable. Everything it drops is counted rather than discarded
 * silently: a reference thin enough to send most traffic to the provider/model fallback is a result
 * worth seeing before it is committed, not a surprise in the Speed coverage panel later.
 *
 * Nothing here may read at score time. The score loads the committed artifact, so one tenant's
 * traffic can never move another tenant's number between freezes.
 */
export const buildLatencyReferenceArtifact = ({
  artifactVersion,
  ttftSamples,
  throughputSamples,
  minimumSampleCount,
  minimumOrganizationCount,
}: {
  readonly artifactVersion: string
  readonly ttftSamples: readonly LatencyCohortSample[]
  readonly throughputSamples: readonly LatencyCohortSample[]
  readonly minimumSampleCount: number
  readonly minimumOrganizationCount: number
}): LatencyReferenceBuildReport => {
  const context: GateContext = { minimumSampleCount, minimumOrganizationCount, rejected: emptyRejections() }
  const ttft = ttftSamples.flatMap((sample) => {
    const cohort = toTtftCohort(sample, context)
    return cohort ? [cohort] : []
  })
  const throughput = throughputSamples.flatMap((sample) => {
    const cohort = toThroughputCohort(sample, context)
    return cohort ? [cohort] : []
  })

  return {
    artifact: {
      artifactVersion,
      calibration: "calibrated",
      minimumSampleCount,
      minimumOrganizationCount,
      ttft,
      throughput,
    },
    ttftCohortCount: ttft.length,
    throughputCohortCount: throughput.length,
    rejected: context.rejected,
  }
}
