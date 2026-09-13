import { SpanId, TraceId } from "@domain/shared"
import type { SessionGenerationFact } from "@domain/spans"
import { describe, expect, it } from "vitest"
import type { LatencyReferenceArtifact } from "../entities/latency-reference-artifact.ts"
import { readSessionCostEvidence } from "./read-session-cost-evidence.ts"

const traceId = TraceId("trace-1")
const at = (milliseconds: number) => new Date(Date.parse("2026-01-01T00:00:00.000Z") + milliseconds)

const generation = (overrides: Partial<SessionGenerationFact> = {}): SessionGenerationFact =>
  ({
    traceId,
    spanId: SpanId("generation"),
    parentSpanId: "root",
    operation: "chat",
    provider: "openai",
    model: "gpt-4o",
    responseModel: "",
    startTime: at(100),
    endTime: at(1_900),
    durationNs: 1_800_000_000,
    name: "chat",
    toolName: "",
    agentName: "",
    tokens: {
      tokensInput: 2_000,
      tokensOutput: 100,
      tokensCacheRead: 0,
      tokensCacheCreate: 0,
      tokensReasoning: 0,
    },
    costInputMicrocents: 700,
    costOutputMicrocents: 300,
    costTotalMicrocents: 1_000,
    costSource: "estimated",
    costPricedProvider: "openai",
    costPricedModel: "gpt-4o",
    isStreaming: true,
    timeToFirstTokenNs: 500_000_000,
    finishReasons: ["stop"],
    statusCode: "ok",
    statusMessage: "",
    errorType: "",
    capturedBytes: { inputMessages: 0, outputMessages: 0, toolDefinitions: 0 },
    content: null,
    inputContentState: "absent",
    outputContentState: "absent",
    toolDefinitionContentState: "absent",
    pricingState: "registryEstimated",
    modelContextState: "known",
    modelContextLimitTokens: 128_000,
    ...overrides,
  }) as SessionGenerationFact

const artifact: LatencyReferenceArtifact = {
  artifactVersion: "latency-reader-test",
  calibration: "calibrated",
  minimumSampleCount: 10,
  minimumOrganizationCount: 3,
  ttft: [
    {
      provider: "openai",
      model: "gpt-4o",
      granularity: "providerModel",
      sampleCount: 100,
      organizationCount: 10,
      medianTtftNs: 100_000_000,
    },
  ],
  throughput: [
    {
      provider: "openai",
      model: "gpt-4o",
      granularity: "providerModel",
      sampleCount: 100,
      organizationCount: 10,
      medianTokensPerSecond: 100,
    },
  ],
}

const readWith = (
  generations: readonly SessionGenerationFact[],
  latencyArtifact: LatencyReferenceArtifact | undefined,
) =>
  readSessionCostEvidence({
    generations,
    toolCalls: [],
    memoryEvents: [],
    countTokens: () => 0,
    completed: true,
    recoveredIncidents: [],
    recoveredStructuralDefects: [],
    toolDefinitions: [],
    unmatchedToolCallNames: [],
    cacheEvidence: null,
    ...(latencyArtifact ? { latencyArtifact } : {}),
  })

const read = (generations: readonly SessionGenerationFact[]) => readWith(generations, artifact)
const readOnPath = (
  generations: readonly SessionGenerationFact[],
  latencyArtifact: LatencyReferenceArtifact | undefined,
) =>
  readWith(
    [
      generation({
        spanId: SpanId("root"),
        parentSpanId: "",
        operation: "invoke_agent",
        provider: "",
        model: "",
        startTime: at(0),
        endTime: at(2_000),
        durationNs: 2_000_000_000,
      }),
      ...generations,
    ],
    latencyArtifact,
  )

describe("readSessionCostEvidence", () => {
  it("turns TTFT and throughput excess into modeled avoidable critical-path time", () => {
    const root = generation({
      spanId: SpanId("root"),
      parentSpanId: "",
      operation: "invoke_agent",
      provider: "",
      model: "",
      startTime: at(0),
      endTime: at(2_000),
      durationNs: 2_000_000_000,
      pricingState: "notSpendBearing",
      costTotalMicrocents: 0,
      modelContextState: "unknownPair",
      modelContextLimitTokens: null,
    })

    const result = read([root, generation()])

    expect(result.speed.estimatedAvoidableNs).toBe(700_000_000)
    expect(result.speed.appliedClaims).toEqual([
      expect.objectContaining({
        spanId: SpanId("generation"),
        cause: "latency:ttft+throughput",
        evidence: "modeled",
        removedNs: 700_000_000,
      }),
    ])
  })

  it("checks model-limit coverage only for LLM completions", () => {
    const wrapper = generation({
      spanId: SpanId("wrapper"),
      parentSpanId: "",
      operation: "invoke_agent",
      provider: "",
      model: "",
      modelContextState: "unknownPair",
      modelContextLimitTokens: null,
    })

    expect(
      read([wrapper, generation()]).readers.find((reader) => reader.readerId === "context.model_limits"),
    ).toMatchObject({
      applicable: true,
      readableCount: 1,
      totalCount: 1,
    })
  })

  it("separates workloads by output size", () => {
    const shortOutput = read([generation()]).workloadStratum
    const longOutput = read([generation({ tokens: { ...generation().tokens, tokensOutput: 5_000 } })]).workloadStratum

    expect(shortOutput).not.toBe(longOutput)
  })

  it("separates workloads by the tools offered to the model", () => {
    const withTools = readSessionCostEvidence({
      generations: [
        generation({
          capturedBytes: { inputMessages: 0, outputMessages: 0, toolDefinitions: 1 },
          content: {
            inputMessages: [],
            outputMessages: [],
            toolDefinitions: [{ name: "search", description: "", parameters: {} }],
          },
          toolDefinitionContentState: "captured",
        }),
      ],
      toolCalls: [],
      memoryEvents: [],
      countTokens: () => 0,
      completed: true,
      recoveredIncidents: [],
      recoveredStructuralDefects: [],
      toolDefinitions: [
        {
          name: "search",
          estimatedSerializedTokens: 20,
          requestCount: 1,
          calledAtLeastOnce: false,
          observationPeriodComplete: false,
        },
      ],
      unmatchedToolCallNames: [],
      cacheEvidence: null,
      latencyArtifact: artifact,
    }).workloadStratum

    expect(withTools).not.toBe(read([generation()]).workloadStratum)
  })

  it("separates unknown tool metadata from an observed empty toolset", () => {
    const unknownTools = read([generation()]).workloadStratum
    const noTools = read([
      generation({
        capturedBytes: { inputMessages: 1, outputMessages: 0, toolDefinitions: 0 },
        content: { inputMessages: [], outputMessages: [], toolDefinitions: [] },
        inputContentState: "captured",
      }),
    ]).workloadStratum

    expect(unknownTools).toContain("|unknown-tools|")
    expect(noTools).toContain("|no-tools|")
  })
})

describe("latency reader coverage", () => {
  const reader = (evidence: ReturnType<typeof read>, readerId: "spans.ttft" | "spans.throughput") =>
    evidence.readers.find((fact) => fact.readerId === readerId)

  it("reports a readable cohort when the frozen reference answers", () => {
    const evidence = readOnPath([generation()], artifact)

    expect(reader(evidence, "spans.ttft")).toMatchObject({ applicable: true, readableCount: 1, totalCount: 1 })
    expect(reader(evidence, "spans.throughput")).toMatchObject({ applicable: true, readableCount: 1, totalCount: 1 })
    expect(reader(evidence, "spans.ttft")?.limitation).toBeUndefined()
  })

  it("reports an unbuilt reference as unmeasured rather than contributing nothing silently", () => {
    const evidence = readOnPath([generation()], undefined)

    expect(reader(evidence, "spans.ttft")).toMatchObject({
      applicable: true,
      readableCount: 0,
      totalCount: 1,
      limitation: "missingLatencyReference",
    })
    expect(reader(evidence, "spans.throughput")).toMatchObject({
      applicable: true,
      readableCount: 0,
      limitation: "missingLatencyReference",
    })
    expect(evidence.speed.estimatedAvoidableNs).toBe(0)
  })

  it("reports a cohort the reference does not cover as unreadable", () => {
    const evidence = readOnPath([generation({ provider: "anthropic", model: "claude-sonnet-5" })], artifact)

    expect(reader(evidence, "spans.ttft")).toMatchObject({
      readableCount: 0,
      limitation: "missingLatencyReference",
    })
  })

  it("ignores reference gaps for generations that hold no critical-path time", () => {
    const root = generation({
      spanId: SpanId("root"),
      parentSpanId: "",
      operation: "invoke_agent",
      provider: "",
      model: "",
      startTime: at(0),
      endTime: at(2_000),
      durationNs: 2_000_000_000,
    })
    const background = generation({
      spanId: SpanId("background"),
      provider: "anthropic",
      model: "claude-sonnet-5",
      startTime: at(200),
      endTime: at(400),
      durationNs: 200_000_000,
    })

    const evidence = read([root, generation(), background])

    expect(reader(evidence, "spans.ttft")).toMatchObject({ readableCount: 1, totalCount: 1 })
    expect(reader(evidence, "spans.throughput")).toMatchObject({ readableCount: 1, totalCount: 1 })
  })

  it("leaves a non-streaming call out of the time-to-first-token denominator entirely", () => {
    const evidence = readOnPath([generation({ isStreaming: false, timeToFirstTokenNs: 0 })], artifact)

    expect(reader(evidence, "spans.ttft")).toMatchObject({ applicable: false, totalCount: 0 })
    expect(reader(evidence, "spans.throughput")).toMatchObject({ applicable: true, totalCount: 1 })
  })
})
