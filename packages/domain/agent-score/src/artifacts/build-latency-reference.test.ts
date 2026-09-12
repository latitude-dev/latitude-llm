import { describe, expect, it } from "vitest"
import { lookupThroughputExpectationTps, lookupTtftExpectationNs } from "../entities/latency-reference-artifact.ts"
import { buildLatencyReferenceArtifact, type LatencyCohortSample } from "./build-latency-reference.ts"

const sample = (overrides: Partial<LatencyCohortSample> = {}): LatencyCohortSample => ({
  provider: "openai",
  model: "gpt-5-mini",
  inputBucket: "from4kTo16k",
  outputBucket: "from256To1k",
  streaming: true,
  sampleCount: 1_000,
  organizationCount: 20,
  median: 500_000_000,
  ...overrides,
})

const build = (input: {
  ttftSamples?: readonly LatencyCohortSample[]
  throughputSamples?: readonly LatencyCohortSample[]
  minimumSampleCount?: number
  minimumOrganizationCount?: number
}) =>
  buildLatencyReferenceArtifact({
    artifactVersion: "latency-reference-test",
    ttftSamples: input.ttftSamples ?? [],
    throughputSamples: input.throughputSamples ?? [],
    minimumSampleCount: input.minimumSampleCount ?? 200,
    minimumOrganizationCount: input.minimumOrganizationCount ?? 5,
  })

describe("buildLatencyReferenceArtifact", () => {
  it("keeps a cohort that clears both gates and makes it findable by lookup", () => {
    const report = build({ ttftSamples: [sample()] })
    expect(report.ttftCohortCount).toBe(1)
    const expectation = lookupTtftExpectationNs({
      artifact: report.artifact,
      provider: "openai",
      model: "gpt-5-mini",
      inputTokens: 5_000,
      isStreaming: true,
    })
    expect(expectation.provenance).toBe("cohort")
  })

  it("drops a cohort thin enough to identify one tenant's deployment", () => {
    const report = build({ ttftSamples: [sample({ organizationCount: 1 })] })
    expect(report.ttftCohortCount).toBe(0)
    expect(report.rejected.belowTenantSpread).toBe(1)
  })

  it("drops a cohort below the sample gate", () => {
    const report = build({ ttftSamples: [sample({ sampleCount: 10 })] })
    expect(report.ttftCohortCount).toBe(0)
    expect(report.rejected.belowSampleCount).toBe(1)
  })

  it("drops non-streaming first-token readings, which have no reference to be", () => {
    const report = build({ ttftSamples: [sample({ streaming: false })] })
    expect(report.ttftCohortCount).toBe(0)
    expect(report.rejected.nonStreamingTtft).toBe(1)
  })

  it("keeps non-streaming throughput, where the reading is still meaningful", () => {
    const report = build({ throughputSamples: [sample({ streaming: false, median: 40 })] })
    expect(report.throughputCohortCount).toBe(1)
  })

  it("keeps a provider and model roll-up as the fallback level", () => {
    const report = build({
      ttftSamples: [sample({ inputBucket: null, outputBucket: null, streaming: null })],
    })
    expect(report.artifact.ttft[0]?.granularity).toBe("providerModel")
    const expectation = lookupTtftExpectationNs({
      artifact: report.artifact,
      provider: "openai",
      model: "gpt-5-mini",
      inputTokens: 5_000,
      isStreaming: true,
    })
    expect(expectation.provenance).toBe("providerModel")
  })

  it("drops a bucket the domain does not define rather than guessing one", () => {
    const report = build({ throughputSamples: [sample({ inputBucket: "enormous", median: 40 })] })
    expect(report.throughputCohortCount).toBe(0)
    expect(report.rejected.unknownBucket).toBe(1)
  })

  it("drops a non-positive median instead of emitting an unusable expectation", () => {
    const report = build({ throughputSamples: [sample({ median: 0 })] })
    expect(report.throughputCohortCount).toBe(0)
    expect(report.rejected.nonPositiveMedian).toBe(1)
  })

  it("leaves an unmatched cohort unmeasured rather than falling back to the fleet", () => {
    const report = build({ throughputSamples: [sample({ median: 40 })] })
    const expectation = lookupThroughputExpectationTps({
      artifact: report.artifact,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: 5_000,
      outputTokens: 500,
      isStreaming: true,
    })
    expect(expectation.provenance).toBe("unmeasured")
  })

  it("reproduces the same artifact from the same samples and gates", () => {
    const samples = [sample(), sample({ model: "gpt-5" })]
    expect(build({ ttftSamples: samples }).artifact).toEqual(build({ ttftSamples: samples }).artifact)
  })
})
