import type {
  LatencyReferenceArtifact,
  ThroughputReferenceCohort,
  TtftReferenceCohort,
} from "../entities/latency-reference-artifact.ts"

export const LAUNCH_LATENCY_ARTIFACT_VERSION = "latency-reference-v1-provisional"

/**
 * How many readings a cohort needs before its median is a reference, and across how many tenants.
 *
 * The tenant spread is the one that matters: a median drawn from a single customer's private
 * deployment would put that customer's performance into every other project's Speed score. They gate
 * `buildLatencyReferenceArtifact`, not the hand-written bundle below, which rests on published
 * vendor figures and no tenant's traffic at all.
 */
export const LAUNCH_LATENCY_MINIMUM_SAMPLE_COUNT = 200
export const LAUNCH_LATENCY_MINIMUM_ORGANIZATION_COUNT = 5

interface ProvisionalReference {
  readonly provider: string
  readonly model: string
  readonly ttftMs: number
  readonly tokensPerSecond: number
}

/**
 * Published startup latency and generation rate per model family, at the coarse provider/model
 * granularity every lookup falls back to.
 *
 * Deliberately not bucketed: a bucketed cohort claims the expectation varies with prompt size and
 * streaming mode in a way somebody measured, and nobody has. One number per pair is the weakest
 * claim that still makes the dimension measurable.
 */
const PROVISIONAL_REFERENCES: readonly ProvisionalReference[] = [
  { provider: "openai", model: "gpt-4.1", ttftMs: 450, tokensPerSecond: 95 },
  { provider: "openai", model: "gpt-4.1-mini", ttftMs: 330, tokensPerSecond: 130 },
  { provider: "openai", model: "gpt-4o", ttftMs: 480, tokensPerSecond: 90 },
  { provider: "openai", model: "gpt-4o-mini", ttftMs: 350, tokensPerSecond: 120 },
  { provider: "openai", model: "gpt-5", ttftMs: 700, tokensPerSecond: 75 },
  { provider: "openai", model: "gpt-5-mini", ttftMs: 520, tokensPerSecond: 110 },
  { provider: "openai", model: "gpt-5-nano", ttftMs: 380, tokensPerSecond: 150 },
  { provider: "openai", model: "gpt-5-pro", ttftMs: 1_200, tokensPerSecond: 45 },
  { provider: "anthropic", model: "claude-opus-4-5", ttftMs: 900, tokensPerSecond: 60 },
  { provider: "anthropic", model: "claude-sonnet-4-5", ttftMs: 600, tokensPerSecond: 85 },
  { provider: "anthropic", model: "claude-haiku-4-5", ttftMs: 380, tokensPerSecond: 140 },
  { provider: "google", model: "gemini-2.5-pro", ttftMs: 800, tokensPerSecond: 70 },
  { provider: "google", model: "gemini-2.5-flash", ttftMs: 420, tokensPerSecond: 130 },
  { provider: "google", model: "gemini-2.5-flash-lite", ttftMs: 300, tokensPerSecond: 180 },
]

const MILLISECOND_NS = 1_000_000

/**
 * A hand-written reference rests on one published figure, so it says so.
 *
 * A sampled freeze carries the counts it was built from and is gated on them; claiming a sample
 * size here would dress a vendor's published number as a measured distribution.
 */
const HAND_WRITTEN_SUPPORT = { sampleCount: 1, organizationCount: 1 } as const

const ttftCohorts: TtftReferenceCohort[] = PROVISIONAL_REFERENCES.map((reference) => ({
  provider: reference.provider,
  model: reference.model,
  granularity: "providerModel",
  medianTtftNs: reference.ttftMs * MILLISECOND_NS,
  ...HAND_WRITTEN_SUPPORT,
}))

const throughputCohorts: ThroughputReferenceCohort[] = PROVISIONAL_REFERENCES.map((reference) => ({
  provider: reference.provider,
  model: reference.model,
  granularity: "providerModel",
  medianTokensPerSecond: reference.tokensPerSecond,
  ...HAND_WRITTEN_SUPPORT,
}))

/**
 * The frozen latency reference, before the fleet build has run.
 *
 * `buildLatencyReferenceArtifact` produces the real one from cross-organisation samples, and these
 * entries are what stands in until it has. The alternative was shipping no cohorts at all, which
 * made every generation unmeasured and left Speed reading as a flat hundred with nothing behind it:
 * a dimension that cannot lose points is worse than one whose expectation is approximate, because
 * only the second one tells anybody they were slow. Being provisional, the numbers are expectations
 * rather than measurements, and `calibration` is what says so to everything downstream.
 */
export const LAUNCH_LATENCY_REFERENCE_ARTIFACT = {
  artifactVersion: LAUNCH_LATENCY_ARTIFACT_VERSION,
  calibration: "provisional",
  minimumSampleCount: HAND_WRITTEN_SUPPORT.sampleCount,
  minimumOrganizationCount: HAND_WRITTEN_SUPPORT.organizationCount,
  ttft: ttftCohorts,
  throughput: throughputCohorts,
} satisfies LatencyReferenceArtifact
