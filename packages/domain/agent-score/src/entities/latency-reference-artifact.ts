import {
  LATENCY_INPUT_BUCKETS,
  LATENCY_OUTPUT_BUCKETS,
  latencyCohortId,
  latencyInputBucket,
  latencyOutputBucket,
  providerModelCohortId,
  throughputCohortId,
} from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { InvalidLatencyReferenceArtifactError } from "../errors.ts"

const latencyInputBucketSchema = z.enum(LATENCY_INPUT_BUCKETS)
const latencyOutputBucketSchema = z.enum(LATENCY_OUTPUT_BUCKETS)

/**
 * `cohort` — the full provider, model, prompt-size and streaming key. `providerModel` — the coarser
 * entry the fallback chain drops to. There is deliberately no global level: one distribution across
 * models would compare a reasoning model with a small chat model.
 */
export const latencyReferenceGranularitySchema = z.enum(["cohort", "providerModel"])
export type LatencyReferenceGranularity = z.infer<typeof latencyReferenceGranularitySchema>

const latencyReferenceCohortFields = {
  provider: z.string().min(1),
  model: z.string().min(1),
  granularity: latencyReferenceGranularitySchema,
  inputBucket: latencyInputBucketSchema.optional(),
  streaming: z.boolean().optional(),
  sampleCount: z.number().int().positive(),
  /**
   * Distinct organizations behind the cohort. A cohort thin enough to identify one customer's
   * private deployment is the tenant leak this artifact has to refuse, so the count is stored with
   * the reading rather than checked once at build time.
   */
  organizationCount: z.number().int().positive(),
} as const

const requireCohortKey = (
  cohort: {
    readonly granularity: LatencyReferenceGranularity
    readonly inputBucket?: string | undefined
    readonly streaming?: boolean | undefined
  },
  ctx: z.RefinementCtx,
): void => {
  if (cohort.granularity === "cohort") {
    if (cohort.inputBucket === undefined) {
      ctx.addIssue({ code: "custom", path: ["inputBucket"], message: "a cohort reading needs its prompt-size bucket" })
    }
    if (cohort.streaming === undefined) {
      ctx.addIssue({ code: "custom", path: ["streaming"], message: "a cohort reading needs its streaming mode" })
    }
    return
  }
  if (cohort.inputBucket !== undefined) {
    ctx.addIssue({ code: "custom", path: ["inputBucket"], message: "a provider/model fallback carries no bucket" })
  }
  if (cohort.streaming !== undefined) {
    ctx.addIssue({ code: "custom", path: ["streaming"], message: "a provider/model fallback carries no mode" })
  }
}

export const ttftReferenceCohortSchema = z
  .object({ ...latencyReferenceCohortFields, medianTtftNs: z.number().positive() })
  .superRefine((cohort, ctx) => {
    requireCohortKey(cohort, ctx)
    if (cohort.granularity === "cohort" && cohort.streaming === false) {
      ctx.addIssue({
        code: "custom",
        path: ["streaming"],
        message: "non-streaming time to first token collapses into total duration and has no reference",
      })
    }
  })
export type TtftReferenceCohort = z.infer<typeof ttftReferenceCohortSchema>

export const throughputReferenceCohortSchema = z
  .object({
    ...latencyReferenceCohortFields,
    outputBucket: latencyOutputBucketSchema.optional(),
    medianTokensPerSecond: z.number().positive(),
  })
  .superRefine((cohort, ctx) => {
    requireCohortKey(cohort, ctx)
    if (cohort.granularity === "cohort" && cohort.outputBucket === undefined) {
      ctx.addIssue({ code: "custom", path: ["outputBucket"], message: "a throughput cohort needs its output bucket" })
    }
    if (cohort.granularity === "providerModel" && cohort.outputBucket !== undefined) {
      ctx.addIssue({ code: "custom", path: ["outputBucket"], message: "a provider/model fallback carries no bucket" })
    }
  })
export type ThroughputReferenceCohort = z.infer<typeof throughputReferenceCohortSchema>

export const latencyReferenceArtifactSchema = z
  .object({
    artifactVersion: z.string().min(1),
    calibration: z.enum(["provisional", "calibrated"]),
    minimumSampleCount: z.number().int().positive(),
    minimumOrganizationCount: z.number().int().positive(),
    ttft: z.array(ttftReferenceCohortSchema),
    throughput: z.array(throughputReferenceCohortSchema),
  })
  .superRefine((artifact, ctx) => {
    const ttftIds = artifact.ttft.map((cohort) => referenceCohortId(cohort))
    if (new Set(ttftIds).size !== ttftIds.length) {
      ctx.addIssue({ code: "custom", path: ["ttft"], message: "cohort keys must be unique" })
    }
    const throughputIds = artifact.throughput.map((cohort) => referenceCohortId(cohort))
    if (new Set(throughputIds).size !== throughputIds.length) {
      ctx.addIssue({ code: "custom", path: ["throughput"], message: "cohort keys must be unique" })
    }
    for (const [metric, cohorts] of [
      ["ttft", artifact.ttft],
      ["throughput", artifact.throughput],
    ] as const) {
      for (const [index, cohort] of cohorts.entries()) {
        if (cohort.sampleCount < artifact.minimumSampleCount) {
          ctx.addIssue({ code: "custom", path: [metric, index], message: "cohort is below the sample gate" })
        }
        if (cohort.organizationCount < artifact.minimumOrganizationCount) {
          ctx.addIssue({ code: "custom", path: [metric, index], message: "cohort is below the tenant-spread gate" })
        }
      }
    }
  })
export type LatencyReferenceArtifact = z.infer<typeof latencyReferenceArtifactSchema>

const referenceCohortId = (cohort: TtftReferenceCohort | ThroughputReferenceCohort): string => {
  const { inputBucket, streaming, provider, model } = cohort
  if (cohort.granularity === "providerModel" || inputBucket === undefined || streaming === undefined) {
    return providerModelCohortId(cohort)
  }
  const outputBucket = "outputBucket" in cohort ? cohort.outputBucket : undefined
  return outputBucket === undefined
    ? latencyCohortId({ provider, model, inputBucket, streaming })
    : throughputCohortId({ provider, model, inputBucket, streaming, outputBucket })
}

export const LATENCY_EXPECTATION_GAPS = ["unknownPair", "notStreaming", "noReference"] as const
export type LatencyExpectationGap = (typeof LATENCY_EXPECTATION_GAPS)[number]

export type LatencyExpectation =
  | {
      readonly provenance: "cohort" | "providerModel"
      readonly value: number
      readonly sampleCount: number
    }
  | { readonly provenance: "unmeasured"; readonly reason: LatencyExpectationGap }

interface ProviderModelKeyed {
  readonly granularity: LatencyReferenceGranularity
  readonly provider: string
  readonly model: string
}

const providerModelFallback = <Cohort extends ProviderModelKeyed>(
  cohorts: readonly Cohort[],
  provider: string,
  model: string,
): Cohort | undefined =>
  cohorts.find(
    (cohort) =>
      cohort.granularity === "providerModel" &&
      providerModelCohortId(cohort) === providerModelCohortId({ provider, model }),
  )

/**
 * The frozen expected time to first token for one call.
 *
 * Falls back provider+model+bucket+streaming, then provider+model, then unmeasured — never to a
 * single fleet-wide distribution. An unmeasured call stays visible as raw latency and contributes
 * no avoidable time.
 */
export const lookupTtftExpectationNs = ({
  artifact,
  provider,
  model,
  inputTokens,
  isStreaming,
}: {
  readonly artifact: LatencyReferenceArtifact
  readonly provider: string
  readonly model: string
  readonly inputTokens: number
  readonly isStreaming: boolean
}): LatencyExpectation => {
  if (!provider || !model) return { provenance: "unmeasured", reason: "unknownPair" }
  if (!isStreaming) return { provenance: "unmeasured", reason: "notStreaming" }
  const wanted = latencyCohortId({ provider, model, inputBucket: latencyInputBucket(inputTokens), streaming: true })
  const exact = artifact.ttft.find((cohort) => cohort.granularity === "cohort" && referenceCohortId(cohort) === wanted)
  if (exact) return { provenance: "cohort", value: exact.medianTtftNs, sampleCount: exact.sampleCount }
  const fallback = providerModelFallback(artifact.ttft, provider, model)
  if (fallback) return { provenance: "providerModel", value: fallback.medianTtftNs, sampleCount: fallback.sampleCount }
  return { provenance: "unmeasured", reason: "noReference" }
}

/** The frozen expected generation rate for one call, using the same fallback chain as TTFT. */
export const lookupThroughputExpectationTps = ({
  artifact,
  provider,
  model,
  inputTokens,
  outputTokens,
  isStreaming,
}: {
  readonly artifact: LatencyReferenceArtifact
  readonly provider: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly isStreaming: boolean
}): LatencyExpectation => {
  if (!provider || !model) return { provenance: "unmeasured", reason: "unknownPair" }
  const wanted = throughputCohortId({
    provider,
    model,
    inputBucket: latencyInputBucket(inputTokens),
    streaming: isStreaming,
    outputBucket: latencyOutputBucket(outputTokens),
  })
  const exact = artifact.throughput.find(
    (cohort) => cohort.granularity === "cohort" && referenceCohortId(cohort) === wanted,
  )
  if (exact) return { provenance: "cohort", value: exact.medianTokensPerSecond, sampleCount: exact.sampleCount }
  const fallback = providerModelFallback(artifact.throughput, provider, model)
  if (fallback) {
    return { provenance: "providerModel", value: fallback.medianTokensPerSecond, sampleCount: fallback.sampleCount }
  }
  return { provenance: "unmeasured", reason: "noReference" }
}

/**
 * Startup latency beyond the cohort median. The median is an expectation, not a pass threshold: a
 * call faster than it earns no credit that could erase waste elsewhere.
 */
export const excessTtftNs = ({
  observedTtftNs,
  expectation,
}: {
  readonly observedTtftNs: number
  readonly expectation: LatencyExpectation
}): number => (expectation.provenance === "unmeasured" ? 0 : Math.max(0, observedTtftNs - expectation.value))

/**
 * Generation time beyond what the cohort rate would have taken for the same produced output, so a
 * short answer is not rewarded for being short.
 */
export const excessGenerationNs = ({
  observedGenerationNs,
  outputTokens,
  expectation,
}: {
  readonly observedGenerationNs: number
  readonly outputTokens: number
  readonly expectation: LatencyExpectation
}): number => {
  if (expectation.provenance === "unmeasured" || outputTokens <= 0) return 0
  const expectedNs = (outputTokens / expectation.value) * 1_000_000_000
  return Math.max(0, observedGenerationNs - expectedNs)
}

export const loadLatencyReferenceArtifact = (
  artifact: unknown,
): Effect.Effect<LatencyReferenceArtifact, InvalidLatencyReferenceArtifactError> => {
  const parsed = latencyReferenceArtifactSchema.safeParse(artifact)
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(
        new InvalidLatencyReferenceArtifactError({
          issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`),
        }),
      )
}
