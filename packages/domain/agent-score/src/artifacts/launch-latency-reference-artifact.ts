import type { LatencyReferenceArtifact } from "../entities/latency-reference-artifact.ts"

export const LAUNCH_LATENCY_ARTIFACT_VERSION = "latency-reference-v1-unbuilt"

/**
 * How many readings a cohort needs before its median is a reference, and across how many tenants.
 *
 * The tenant spread is the one that matters: a median drawn from a single customer's private
 * deployment would put that customer's performance into every other project's Speed score.
 */
export const LAUNCH_LATENCY_MINIMUM_SAMPLE_COUNT = 200
export const LAUNCH_LATENCY_MINIMUM_ORGANIZATION_COUNT = 5

/**
 * The frozen fleet latency reference, before it has been built.
 *
 * It carries no cohorts on purpose. `buildLatencyReferenceArtifact` produces the real one from
 * cross-organisation samples, and until that has been run and its output committed, every lookup
 * falls through to `noReference`. That is the safe direction: an absent reference makes TTFT and
 * throughput unmeasured and lowers Speed coverage, where inventing an expectation would score every
 * generation as exactly on time and quietly raise the dimension.
 */
export const LAUNCH_LATENCY_REFERENCE_ARTIFACT = {
  artifactVersion: LAUNCH_LATENCY_ARTIFACT_VERSION,
  calibration: "provisional",
  minimumSampleCount: LAUNCH_LATENCY_MINIMUM_SAMPLE_COUNT,
  minimumOrganizationCount: LAUNCH_LATENCY_MINIMUM_ORGANIZATION_COUNT,
  ttft: [],
  throughput: [],
} satisfies LatencyReferenceArtifact
