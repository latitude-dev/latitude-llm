import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { InvalidLatencyReferenceArtifactError } from "../errors.ts"
import {
  excessGenerationNs,
  excessTtftNs,
  type LatencyReferenceArtifact,
  latencyReferenceArtifactSchema,
  loadLatencyReferenceArtifact,
  lookupThroughputExpectationTps,
  lookupTtftExpectationNs,
  throughputReferenceCohortSchema,
  ttftReferenceCohortSchema,
} from "./latency-reference-artifact.ts"

const ttftCohort = {
  provider: "openai",
  model: "gpt-4o",
  granularity: "cohort",
  inputBucket: "from1kTo4k",
  streaming: true,
  sampleCount: 500,
  organizationCount: 12,
  medianTtftNs: 400_000_000,
} satisfies LatencyReferenceArtifact["ttft"][number]

const throughputCohort = {
  provider: "openai",
  model: "gpt-4o",
  granularity: "cohort",
  inputBucket: "from1kTo4k",
  outputBucket: "from256To1k",
  streaming: true,
  sampleCount: 500,
  organizationCount: 12,
  medianTokensPerSecond: 50,
} satisfies LatencyReferenceArtifact["throughput"][number]

const artifact = {
  artifactVersion: "latency-reference-test-provisional",
  calibration: "provisional",
  minimumSampleCount: 30,
  minimumOrganizationCount: 5,
  ttft: [
    ttftCohort,
    {
      provider: "openai",
      model: "gpt-4o",
      granularity: "providerModel",
      sampleCount: 5_000,
      organizationCount: 40,
      medianTtftNs: 600_000_000,
    },
  ],
  throughput: [
    throughputCohort,
    {
      provider: "openai",
      model: "gpt-4o",
      granularity: "providerModel",
      sampleCount: 5_000,
      organizationCount: 40,
      medianTokensPerSecond: 30,
    },
  ],
} satisfies LatencyReferenceArtifact

const lookupTtft = (overrides: Partial<Parameters<typeof lookupTtftExpectationNs>[0]> = {}) =>
  lookupTtftExpectationNs({
    artifact,
    provider: "openai",
    model: "gpt-4o",
    inputTokens: 2_000,
    isStreaming: true,
    ...overrides,
  })

describe("latency reference cohort contracts", () => {
  it("requires the full key on a cohort reading and none of it on a fallback", () => {
    expect(ttftReferenceCohortSchema.parse(ttftCohort).inputBucket).toBe("from1kTo4k")
    const { inputBucket: _bucket, ...withoutBucket } = ttftCohort
    expect(ttftReferenceCohortSchema.safeParse(withoutBucket).success).toBe(false)
    expect(ttftReferenceCohortSchema.safeParse({ ...ttftCohort, granularity: "providerModel" }).success).toBe(false)
  })

  it("keeps the bucket vocabulary bounded", () => {
    expect(ttftReferenceCohortSchema.safeParse({ ...ttftCohort, inputBucket: "from2kTo3k" }).success).toBe(false)
    expect(throughputReferenceCohortSchema.safeParse({ ...throughputCohort, outputBucket: "enormous" }).success).toBe(
      false,
    )
  })

  it("refuses a non-streaming time-to-first-token reference", () => {
    expect(ttftReferenceCohortSchema.safeParse({ ...ttftCohort, streaming: false }).success).toBe(false)
  })

  it("requires an output bucket for a throughput cohort only", () => {
    const { outputBucket: _output, ...withoutOutput } = throughputCohort
    expect(throughputReferenceCohortSchema.safeParse(withoutOutput).success).toBe(false)
    expect(
      throughputReferenceCohortSchema.safeParse({
        provider: "openai",
        model: "gpt-4o",
        granularity: "providerModel",
        outputBucket: "over4k",
        sampleCount: 100,
        organizationCount: 10,
        medianTokensPerSecond: 30,
      }).success,
    ).toBe(false)
  })

  it("rejects non-positive or non-finite medians and counts", () => {
    expect(ttftReferenceCohortSchema.safeParse({ ...ttftCohort, medianTtftNs: 0 }).success).toBe(false)
    expect(ttftReferenceCohortSchema.safeParse({ ...ttftCohort, medianTtftNs: Number.POSITIVE_INFINITY }).success).toBe(
      false,
    )
    expect(ttftReferenceCohortSchema.safeParse({ ...ttftCohort, sampleCount: 0 }).success).toBe(false)
    expect(ttftReferenceCohortSchema.safeParse({ ...ttftCohort, organizationCount: 0 }).success).toBe(false)
  })
})

describe("latencyReferenceArtifactSchema", () => {
  it("accepts a versioned artifact and keeps its provisional status explicit", () => {
    expect(latencyReferenceArtifactSchema.parse(artifact).calibration).toBe("provisional")
  })

  it("rejects a cohort below the sample gate or the tenant-spread gate", () => {
    expect(
      latencyReferenceArtifactSchema.safeParse({ ...artifact, ttft: [{ ...ttftCohort, sampleCount: 10 }] }).success,
    ).toBe(false)
    const thin = latencyReferenceArtifactSchema.safeParse({
      ...artifact,
      throughput: [{ ...throughputCohort, organizationCount: 1 }],
    })
    expect(thin.success).toBe(false)
    if (!thin.success) {
      expect(thin.error.issues.some((issue) => issue.path.join(".") === "throughput.0")).toBe(true)
    }
  })

  it("rejects duplicate cohort keys", () => {
    expect(
      latencyReferenceArtifactSchema.safeParse({ ...artifact, ttft: [ttftCohort, { ...ttftCohort }] }).success,
    ).toBe(false)
  })

  it("requires a version and a calibration state", () => {
    expect(latencyReferenceArtifactSchema.safeParse({ ...artifact, artifactVersion: "" }).success).toBe(false)
    expect(latencyReferenceArtifactSchema.safeParse({ ...artifact, calibration: "frozen" }).success).toBe(false)
  })

  it("loads a valid artifact and reports readable issues otherwise", () => {
    expect(Effect.runSync(loadLatencyReferenceArtifact(artifact)).artifactVersion).toBe(artifact.artifactVersion)
    const failed = Effect.runSync(
      Effect.result(loadLatencyReferenceArtifact({ ...artifact, minimumOrganizationCount: 100 })),
    )
    expect(failed._tag).toBe("Failure")
    if (failed._tag === "Failure") {
      expect(failed.failure).toBeInstanceOf(InvalidLatencyReferenceArtifactError)
      expect(failed.failure.issues.join(" ")).toContain("tenant-spread gate")
    }
  })
})

describe("lookupTtftExpectationNs", () => {
  it("prefers the exact cohort, then the provider and model, then nothing", () => {
    expect(lookupTtft()).toEqual({ provenance: "cohort", value: 400_000_000, sampleCount: 500 })
    expect(lookupTtft({ inputTokens: 100_000 })).toEqual({
      provenance: "providerModel",
      value: 600_000_000,
      sampleCount: 5_000,
    })
    expect(lookupTtft({ model: "gpt-4o-mini" })).toEqual({ provenance: "unmeasured", reason: "noReference" })
  })

  it("never falls back across models", () => {
    const noFallback = { ...artifact, ttft: [ttftCohort] }
    expect(
      lookupTtftExpectationNs({
        artifact: noFallback,
        provider: "anthropic",
        model: "claude",
        inputTokens: 2_000,
        isStreaming: true,
      }),
    ).toEqual({ provenance: "unmeasured", reason: "noReference" })
  })

  it("has no expectation without a pair or without streaming", () => {
    expect(lookupTtft({ provider: "" })).toEqual({ provenance: "unmeasured", reason: "unknownPair" })
    expect(lookupTtft({ model: "" })).toEqual({ provenance: "unmeasured", reason: "unknownPair" })
    expect(lookupTtft({ isStreaming: false })).toEqual({ provenance: "unmeasured", reason: "notStreaming" })
  })
})

describe("lookupThroughputExpectationTps", () => {
  const lookup = (overrides: Partial<Parameters<typeof lookupThroughputExpectationTps>[0]> = {}) =>
    lookupThroughputExpectationTps({
      artifact,
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 2_000,
      outputTokens: 500,
      isStreaming: true,
      ...overrides,
    })

  it("keys on the output bucket and falls back to the provider and model", () => {
    expect(lookup()).toEqual({ provenance: "cohort", value: 50, sampleCount: 500 })
    expect(lookup({ outputTokens: 9_000 })).toEqual({ provenance: "providerModel", value: 30, sampleCount: 5_000 })
  })

  it("keeps a reference for non-streaming generation", () => {
    expect(lookup({ isStreaming: false })).toEqual({ provenance: "providerModel", value: 30, sampleCount: 5_000 })
  })
})

describe("excess against the frozen expectation", () => {
  it("charges only the portion beyond the cohort median", () => {
    const expectation = lookupTtft()

    expect(excessTtftNs({ observedTtftNs: 900_000_000, expectation })).toBe(500_000_000)
    expect(excessTtftNs({ observedTtftNs: 100_000_000, expectation })).toBe(0)
  })

  it("gives an unmeasured cohort no avoidable time", () => {
    expect(
      excessTtftNs({ observedTtftNs: 9_000_000_000, expectation: { provenance: "unmeasured", reason: "noReference" } }),
    ).toBe(0)
  })

  it("compares the same produced output rather than rewarding short answers", () => {
    const expectation = { provenance: "cohort", value: 50, sampleCount: 500 } as const

    expect(excessGenerationNs({ observedGenerationNs: 20_000_000_000, outputTokens: 500, expectation })).toBe(
      10_000_000_000,
    )
    expect(excessGenerationNs({ observedGenerationNs: 8_000_000_000, outputTokens: 500, expectation })).toBe(0)
    expect(excessGenerationNs({ observedGenerationNs: 20_000_000_000, outputTokens: 0, expectation })).toBe(0)
  })
})
