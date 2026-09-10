import type { MemoryEvent } from "@domain/memories"
import { SpanId } from "@domain/shared"
import { buildTraceCriticalPath, type CriticalPathSpanInput, type SessionGenerationFact } from "@domain/spans"
import type { GenAIMessage } from "rosetta-ai"
import { describe, expect, it } from "vitest"
import { costMetricReadingSchema } from "../../entities/cost-metric-reading.ts"
import { buildSessionContentLedger, repeatedAtomTokens } from "./content-atom-ledger.ts"
import { readCacheGap, type SessionCacheEvidence } from "./read-cache-gap.ts"
import { readAvoidablePressure, readRedundantInputShare } from "./read-context-metrics.ts"
import { readNoopRewrites, readRepeatedZeroHits, readRevertedWrites } from "./read-memory-metrics.ts"
import { type AttributableSpendClaim, readRecoverableSpend } from "./read-recoverable-spend.ts"
import { readRecoveredIncidentRate, recoveryAvoidableNs, recoverySpendClaims } from "./read-recovery-metrics.ts"
import { readSessionSpendCoverage } from "./read-spend-coverage.ts"
import {
  readDeadSurface,
  readRepeatedCalls,
  readStructuralDefects,
  readThrashing,
  type ToolDefinitionSurface,
} from "./read-tool-metrics.ts"

const BASE_MS = Date.parse("2026-01-01T00:00:00.000Z")
const at = (ms: number) => new Date(BASE_MS + ms)
const words = (content: string) => content.split(/\s+/).filter(Boolean).length

const generation = (overrides: Partial<SessionGenerationFact> = {}): SessionGenerationFact =>
  ({
    traceId: "trace-1",
    spanId: SpanId("span-1"),
    parentSpanId: "",
    operation: "chat",
    provider: "openai",
    model: "gpt-4o",
    responseModel: "",
    startTime: at(0),
    endTime: at(1_000),
    durationNs: 1_000_000_000,
    name: "chat",
    toolName: "",
    agentName: "",
    tokens: { tokensInput: 100, tokensOutput: 20, tokensCacheRead: 0, tokensCacheCreate: 0, tokensReasoning: 0 },
    costInputMicrocents: 700,
    costOutputMicrocents: 300,
    costTotalMicrocents: 1_000,
    costSource: "estimated",
    costPricedProvider: "openai",
    costPricedModel: "gpt-4o",
    isStreaming: true,
    timeToFirstTokenNs: 0,
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

const withInput = (
  spanId: string,
  messages: readonly GenAIMessage[],
  overrides: Partial<SessionGenerationFact> = {},
): SessionGenerationFact =>
  generation({
    spanId: SpanId(spanId),
    inputContentState: "captured",
    capturedBytes: { inputMessages: 1_000, outputMessages: 0, toolDefinitions: 0 },
    content: { inputMessages: messages, outputMessages: [], toolDefinitions: [] },
    ...overrides,
  })

const toolCall = (
  spanId: string,
  overrides: Partial<Parameters<typeof readRepeatedCalls>[0][number]> = {},
): Parameters<typeof readRepeatedCalls>[0][number] =>
  ({
    traceId: "trace-1",
    spanId: SpanId(spanId),
    parentSpanId: "",
    toolCallId: `call-${spanId}`,
    toolName: "Search",
    normalizedToolName: "search",
    inputHash: "IN",
    outputHash: "OUT",
    inputBytes: 10,
    outputBytes: 10,
    startTime: at(0),
    endTime: at(10),
    durationNs: 10_000_000,
    statusCode: "ok",
    statusMessage: "",
    errorType: "",
    ...overrides,
  }) as Parameters<typeof readRepeatedCalls>[0][number]

const memoryEvent = (overrides: Partial<MemoryEvent> = {}): MemoryEvent =>
  ({
    organizationId: "org-1",
    projectId: "project-1",
    storeId: "store-1",
    recordId: "record-1",
    operation: "search_memory",
    changeKind: "read",
    contentHash: "",
    tokenCount: 0,
    recordCount: 0,
    queryText: "who is the user",
    spanId: SpanId("mem-1"),
    traceId: "trace-1",
    sessionId: "session-1",
    userId: "",
    startTime: at(0),
    endTime: at(10),
    source: "otlp",
    ...overrides,
  }) as MemoryEvent

const valid = (reading: unknown) => costMetricReadingSchema.parse(reading)

describe("readSessionSpendCoverage", () => {
  it("keeps provider-reported and registry-estimated spend distinct but both priced", () => {
    const coverage = readSessionSpendCoverage([
      generation({ spanId: SpanId("a"), pricingState: "providerReported", costTotalMicrocents: 400 }),
      generation({ spanId: SpanId("b"), pricingState: "registryEstimated", costTotalMicrocents: 600 }),
    ])

    expect(coverage).toMatchObject({
      providerReportedMicrocents: 400,
      registryEstimatedMicrocents: 600,
      pricedMicrocents: 1_000,
      pricedCallCount: 2,
      complete: true,
    })
  })

  it("stays complete when every priced value came from the registry", () => {
    const coverage = readSessionSpendCoverage([
      generation({ spanId: SpanId("a"), pricingState: "registryEstimated" }),
      generation({ spanId: SpanId("b"), pricingState: "knownFree", costTotalMicrocents: 0 }),
    ])

    expect(coverage).toMatchObject({ providerReportedMicrocents: 0, complete: true, knownFreeCallCount: 1 })
  })

  it("treats a missing pair, a declined price and a legacy zero as gaps, not as free", () => {
    const coverage = readSessionSpendCoverage([
      generation({ spanId: SpanId("a"), pricingState: "unpriced", costTotalMicrocents: 0 }),
      generation({ spanId: SpanId("b"), pricingState: "unknownPair", costTotalMicrocents: 0 }),
      generation({ spanId: SpanId("c"), pricingState: "legacyUnknown", costTotalMicrocents: 0 }),
    ])

    expect(coverage).toMatchObject({
      unpricedCallCount: 1,
      unknownPairCallCount: 1,
      legacyUnknownCallCount: 1,
      complete: false,
      pricedMicrocents: 0,
    })
  })

  it("excludes calls that bear no spend from the denominator", () => {
    expect(readSessionSpendCoverage([generation({ pricingState: "notSpendBearing" })])).toMatchObject({
      spendBearingCallCount: 0,
      complete: true,
    })
  })
})

describe("buildSessionContentLedger", () => {
  const toolResultMessage = (content: string): GenAIMessage =>
    ({ role: "tool", parts: [{ type: "tool_call_response", id: "call-1", response: content }] }) as GenAIMessage
  const userMessage = (content: string): GenAIMessage =>
    ({ role: "user", parts: [{ type: "text", content }] }) as GenAIMessage

  it("identifies an atom by content so a payload carried forward is one atom seen twice", () => {
    const ledger = buildSessionContentLedger({
      generations: [
        withInput("span-1", [userMessage("do the thing"), toolResultMessage("a b c")], { startTime: at(0) }),
        withInput("span-2", [userMessage("do the thing"), toolResultMessage("a b c")], { startTime: at(100) }),
      ],
      countTokens: words,
    })

    expect(ledger.readableGenerationCount).toBe(2)
    expect(ledger.atomsById.size).toBe(2)
    const resultAtom = [...ledger.atomsById.values()].find((atom) => atom.kind === "toolResult")
    expect(ledger.occurrencesByAtom.get(resultAtom?.atomId ?? "")).toEqual(["span-1", "span-2"])
    expect(repeatedAtomTokens({ ledger, atomId: resultAtom?.atomId ?? "" })).toBeGreaterThan(0)
  })

  it("keeps whatever the atoms do not explain as an explicit residual", () => {
    const ledger = buildSessionContentLedger({
      generations: [withInput("span-1", [userMessage("one two three")], {})],
      countTokens: words,
    })

    expect(ledger.generations[0]).toMatchObject({ attributedTokens: 3, reportedInputTokens: 100, residualTokens: 97 })
  })

  it("records an overshoot instead of a negative residual when the tokenizer runs long", () => {
    const ledger = buildSessionContentLedger({
      generations: [
        withInput("span-1", [userMessage("one two three")], {
          tokens: { tokensInput: 1, tokensOutput: 0, tokensCacheRead: 0, tokensCacheCreate: 0, tokensReasoning: 0 },
        }),
      ],
      countTokens: words,
    })

    expect(ledger.generations[0]).toMatchObject({ residualTokens: 0, overshootTokens: 2 })
  })

  it("counts a generation with no captured input as unreadable rather than empty", () => {
    const ledger = buildSessionContentLedger({ generations: [generation()], countTokens: words })

    expect(ledger).toMatchObject({ readableGenerationCount: 0, unreadableGenerationCount: 1, readableInputTokens: 0 })
  })

  it("counts a budget-skipped payload as unreadable too", () => {
    const ledger = buildSessionContentLedger({
      generations: [
        generation({
          inputContentState: "truncated",
          capturedBytes: { inputMessages: 5_000, outputMessages: 0, toolDefinitions: 0 },
        }),
      ],
      countTokens: words,
    })

    expect(ledger.unreadableGenerationCount).toBe(1)
  })
})

describe("readRecoverableSpend", () => {
  const generations = [
    generation({ spanId: SpanId("a"), costTotalMicrocents: 400 }),
    generation({ spanId: SpanId("b"), costTotalMicrocents: 600 }),
  ]
  const coverage = readSessionSpendCoverage(generations)

  it("unions claims on the same generation so two readers cannot recover it twice", () => {
    const claims: AttributableSpendClaim[] = [
      { spanId: "a", cause: "retry", exactMicrocents: 400 },
      { spanId: "a", cause: "repeated-call", exactMicrocents: 400 },
    ]
    const reading = valid(readRecoverableSpend({ generations, coverage, claims }))

    expect(reading.adverseUnits).toBe(400)
    expect(reading.rawValue).toBeCloseTo(0.4, 6)
    expect(reading.observations).toHaveLength(1)
  })

  it("caps a claim at what its generation was billed", () => {
    const reading = valid(
      readRecoverableSpend({
        generations,
        coverage,
        claims: [{ spanId: "a", cause: "retry", exactMicrocents: 9_999 }],
      }),
    )

    expect(reading.adverseUnits).toBe(400)
  })

  it("returns an identification bound when a total cannot be split exactly", () => {
    const reading = valid(
      readRecoverableSpend({
        generations,
        coverage,
        claims: [{ spanId: "b", cause: "cache", boundedMicrocents: { lower: 100, upper: 500 } }],
      }),
    )

    expect(reading.evidence).toBe("modeled")
    expect(reading.nativeImpact).toMatchObject({ point: 100, upper: 500, interpretation: "identificationBound" })
  })

  it("is exact when every claim is exact, and ignores a claim on an unknown span", () => {
    const reading = valid(
      readRecoverableSpend({
        generations,
        coverage,
        claims: [
          { spanId: "b", cause: "retry", exactMicrocents: 600 },
          { spanId: "missing", cause: "retry", exactMicrocents: 100 },
        ],
      }),
    )

    expect(reading.evidence).toBe("confirmed")
    expect(reading.nativeImpact).toEqual({ unit: "microcents", point: 600 })
  })

  it("is unreadable without pricing and not applicable without spend-bearing calls", () => {
    const unpriced = [generation({ pricingState: "unpriced", costTotalMicrocents: 0 })]
    expect(
      valid(readRecoverableSpend({ generations: unpriced, coverage: readSessionSpendCoverage(unpriced), claims: [] })),
    ).toMatchObject({ readability: "unreadable", limitations: ["missingPricing"] })
    expect(
      valid(readRecoverableSpend({ generations: [], coverage: readSessionSpendCoverage([]), claims: [] })),
    ).toMatchObject({ applicability: "notApplicable" })
  })
})

describe("readCacheGap", () => {
  const evidence = (overrides: Partial<SessionCacheEvidence> = {}): SessionCacheEvidence => ({
    cacheEligibleCallCount: 40,
    averageInputTokens: 8_000,
    achievableCacheTokens: 100_000,
    observedCacheReadTokens: 20_000,
    basis: "prefixMatched",
    cacheReadPriced: true,
    ...overrides,
  })

  it("measures the missed share against achievable cache volume", () => {
    const reading = valid(readCacheGap({ generations: [generation()], evidence: evidence() }))

    expect(reading).toMatchObject({ rawValue: 0.8, eligibleUnits: 100_000, adverseUnits: 80_000 })
    expect(reading.evidence).toBe("confirmed")
  })

  it("reports a cadence-only basis as an upper bound with a zero floor", () => {
    const reading = valid(readCacheGap({ generations: [generation()], evidence: evidence({ basis: "cadenceOnly" }) }))

    expect(reading.evidence).toBe("modeled")
    expect(reading.nativeImpact).toMatchObject({ point: 80_000, lower: 0, upper: 80_000 })
    expect(reading.limitations).toContain("missingContent")
  })

  it("keeps the existing call, prompt-size and material-gap guards as applicability", () => {
    expect(
      valid(readCacheGap({ generations: [generation()], evidence: evidence({ cacheEligibleCallCount: 19 }) })),
    ).toMatchObject({ applicability: "notApplicable" })
    expect(
      valid(readCacheGap({ generations: [generation()], evidence: evidence({ averageInputTokens: 1_000 }) })),
    ).toMatchObject({ applicability: "notApplicable" })
    expect(
      valid(
        readCacheGap({
          generations: [generation()],
          evidence: evidence({ observedCacheReadTokens: 95_000 }),
        }),
      ),
    ).toMatchObject({ applicability: "notApplicable" })
  })

  it("is not applicable when the model has no cache economics at all", () => {
    expect(
      valid(readCacheGap({ generations: [generation()], evidence: evidence({ cacheReadPriced: false }) })),
    ).toMatchObject({ applicability: "notApplicable" })
    expect(valid(readCacheGap({ generations: [generation()], evidence: null }))).toMatchObject({
      applicability: "notApplicable",
    })
  })
})

describe("context readers", () => {
  const toolResult = (content: string): GenAIMessage =>
    ({ role: "tool", parts: [{ type: "tool_call_response", id: "call-1", response: content }] }) as GenAIMessage

  const ledgerOf = (repeats: number) =>
    buildSessionContentLedger({
      generations: Array.from({ length: repeats }, (_, index) =>
        withInput(`span-${index}`, [toolResult("a b c d e")], { startTime: at(index * 100) }),
      ),
      countTokens: words,
    })

  it("penalizes only claimed atoms, and only beyond their first prompt", () => {
    const ledger = ledgerOf(3)
    const atomId = [...ledger.atomsById.keys()][0] as string

    expect(valid(readRedundantInputShare({ ledger, claims: [] })).adverseUnits).toBe(0)
    expect(valid(readRedundantInputShare({ ledger, claims: [{ atomId, cause: "repeated-call" }] })).adverseUnits).toBe(
      10,
    )
  })

  it("reports redundant tokens as an identification bound, never an exact count", () => {
    const ledger = ledgerOf(2)
    const atomId = [...ledger.atomsById.keys()][0] as string
    const reading = valid(readRedundantInputShare({ ledger, claims: [{ atomId, cause: "repeated-call" }] }))

    expect(reading.evidence).toBe("modeled")
    expect(reading.nativeImpact).toMatchObject({ lower: 0, interpretation: "identificationBound" })
  })

  it("is unreadable when no generation input was captured", () => {
    const ledger = buildSessionContentLedger({ generations: [generation()], countTokens: words })

    expect(valid(readRedundantInputShare({ ledger, claims: [] }))).toMatchObject({
      readability: "unreadable",
      limitations: ["missingContent"],
    })
  })

  it("averages pressure per generation against each model's own context limit", () => {
    const ledger = ledgerOf(2)
    const atomId = [...ledger.atomsById.keys()][0] as string
    const reading = valid(readAvoidablePressure({ ledger, claims: [{ atomId, cause: "repeated-call" }] }))

    expect(reading.rawValue).toBeCloseTo(5 / 128_000, 9)
    expect(reading.aggregation).toBe("sessionMean")
  })

  it("excludes a generation with no known context limit and says so", () => {
    const ledger = buildSessionContentLedger({
      generations: [
        withInput("span-1", [toolResult("a b")], { modelContextLimitTokens: null, modelContextState: "unknownPair" }),
      ],
      countTokens: words,
    })

    expect(valid(readAvoidablePressure({ ledger, claims: [] }))).toMatchObject({
      readability: "unreadable",
      limitations: ["unknownModelContext"],
    })
  })
})

describe("tool readers", () => {
  it("counts repeats beyond the first when name, input and output all match", () => {
    const reading = valid(readRepeatedCalls([toolCall("a"), toolCall("b", { startTime: at(500) })]))

    expect(reading).toMatchObject({ rawValue: 0.5, eligibleUnits: 2, adverseUnits: 1 })
    expect(reading.evidence).toBe("modeled")
  })

  it("treats a different output as different work", () => {
    expect(
      valid(readRepeatedCalls([toolCall("a"), toolCall("b", { outputHash: "OTHER", startTime: at(500) })]))
        .adverseUnits,
    ).toBe(0)
  })

  it("excludes calls with an unreadable payload from both sides", () => {
    expect(
      valid(readRepeatedCalls([toolCall("a", { inputHash: "" }), toolCall("b", { outputHash: "" })])),
    ).toMatchObject({ readability: "unreadable", eligibleUnits: 2 })
  })

  it("does not blame a status check that repeats on a timer", () => {
    const polling = [0, 1_000, 2_000, 3_000].map((offset, index) =>
      toolCall(`poll-${index}`, { startTime: at(offset), endTime: at(offset + 5) }),
    )

    expect(valid(readRepeatedCalls(polling)).adverseUnits).toBe(0)
  })

  it("names a loop only from three or more consecutive identical calls", () => {
    const irregular = [0, 10, 700].map((offset, index) =>
      toolCall(`loop-${index}`, { startTime: at(offset), endTime: at(offset + 5) }),
    )

    expect(valid(readThrashing(irregular)).adverseUnits).toBe(3)
    expect(valid(readThrashing([toolCall("a"), toolCall("b", { startTime: at(400) })]))).toMatchObject({
      applicability: "notApplicable",
    })
  })

  it("shares call atoms between the loop and repeated-call views", () => {
    const calls = [0, 10, 700].map((offset, index) =>
      toolCall(`loop-${index}`, { startTime: at(offset), endTime: at(offset + 5) }),
    )
    const repeated = valid(readRepeatedCalls(calls))
    const thrashing = valid(readThrashing(calls))

    expect(new Set(thrashing.observations.map((observation) => observation.atomId))).toEqual(
      new Set(repeated.observations.map((observation) => observation.atomId)),
    )
  })

  it("counts only recovered structural defects", () => {
    const reading = valid(
      readStructuralDefects({
        calls: [toolCall("a"), toolCall("b")],
        recoveredDefects: [{ traceId: "trace-1", spanId: "a", findingKind: "malformed" }],
        structureCaptured: true,
      }),
    )

    expect(reading).toMatchObject({ adverseUnits: 1, eligibleUnits: 2, evidence: "confirmed" })
  })

  it("scores a dead definition in context tokens, never as an invented execution", () => {
    const definitions: ToolDefinitionSurface[] = [
      {
        name: "unused",
        estimatedSerializedTokens: 100,
        requestCount: 5,
        calledAtLeastOnce: false,
        observationPeriodComplete: true,
      },
      {
        name: "used",
        estimatedSerializedTokens: 100,
        requestCount: 5,
        calledAtLeastOnce: true,
        observationPeriodComplete: true,
      },
    ]
    const reading = valid(readDeadSurface({ definitions, readableInputTokens: 10_000, unmatchedCallNames: [] }))

    expect(reading).toMatchObject({ family: "context", rawUnit: "inputTokens", adverseUnits: 500 })
    expect(reading.rawValue).toBeCloseTo(0.05, 6)
  })

  it("excludes a definition whose observation period is incomplete and warns on a name mismatch", () => {
    expect(
      valid(
        readDeadSurface({
          definitions: [
            {
              name: "new",
              estimatedSerializedTokens: 100,
              requestCount: 1,
              calledAtLeastOnce: false,
              observationPeriodComplete: false,
            },
          ],
          readableInputTokens: 1_000,
          unmatchedCallNames: [],
        }),
      ),
    ).toMatchObject({ applicability: "notApplicable", limitations: ["definitionPeriodIncomplete"] })
    expect(
      valid(
        readDeadSurface({
          definitions: [
            {
              name: "unused",
              estimatedSerializedTokens: 10,
              requestCount: 1,
              calledAtLeastOnce: false,
              observationPeriodComplete: true,
            },
          ],
          readableInputTokens: 1_000,
          unmatchedCallNames: ["mcp__server__unused"],
        }),
      ).limitations,
    ).toContain("unknownToolContract")
  })
})

describe("memory readers", () => {
  it("charges only the repeat of an identical zero-hit query", () => {
    const reading = valid(
      readRepeatedZeroHits([
        memoryEvent({ spanId: SpanId("m1"), endTime: at(10) }),
        memoryEvent({ spanId: SpanId("m2"), endTime: at(20) }),
        memoryEvent({ spanId: SpanId("m3"), queryText: "something else", endTime: at(30) }),
      ]),
    )

    expect(reading).toMatchObject({ adverseUnits: 1, eligibleUnits: 3, rawUnit: "memoryReads" })
  })

  it("leaves a search that found something alone", () => {
    expect(
      valid(
        readRepeatedZeroHits([
          memoryEvent({ spanId: SpanId("m1"), recordCount: 2 }),
          memoryEvent({ spanId: SpanId("m2"), recordCount: 2, endTime: at(20) }),
        ]),
      ).adverseUnits,
    ).toBe(0)
  })

  it("treats an empty query as unreadable rather than as a match", () => {
    expect(valid(readRepeatedZeroHits([memoryEvent({ queryText: "  " })]))).toMatchObject({
      readability: "unreadable",
      limitations: ["missingContent"],
    })
  })

  it("charges a write whose content already matched the record's", () => {
    const writes = [
      memoryEvent({ spanId: SpanId("w1"), changeKind: "add", contentHash: "h1", endTime: at(10) }),
      memoryEvent({ spanId: SpanId("w2"), changeKind: "update", contentHash: "h1", endTime: at(20) }),
      memoryEvent({ spanId: SpanId("w3"), changeKind: "update", contentHash: "h2", endTime: at(30) }),
    ]

    expect(valid(readNoopRewrites(writes))).toMatchObject({ adverseUnits: 1, eligibleUnits: 3 })
  })

  it("never calls two blank hashes equal", () => {
    expect(
      valid(
        readNoopRewrites([
          memoryEvent({ spanId: SpanId("w1"), changeKind: "add", contentHash: "" }),
          memoryEvent({ spanId: SpanId("w2"), changeKind: "update", contentHash: "" }),
        ]),
      ),
    ).toMatchObject({ readability: "unreadable" })
  })

  it("charges the intermediate write of a revert, not the correction", () => {
    const writes = [
      memoryEvent({ spanId: SpanId("w1"), changeKind: "add", contentHash: "a", endTime: at(10) }),
      memoryEvent({ spanId: SpanId("w2"), changeKind: "update", contentHash: "b", endTime: at(20) }),
      memoryEvent({ spanId: SpanId("w3"), changeKind: "update", contentHash: "a", endTime: at(30) }),
    ]
    const reading = valid(readRevertedWrites(writes))

    expect(reading.adverseUnits).toBe(1)
    expect(reading.observations.filter((observation) => observation.adverseUnits > 0)).toHaveLength(1)
    expect(reading.observations.find((observation) => observation.adverseUnits > 0)?.atomId).toContain("w2")
  })

  it("is not applicable when the session touched no memory of that kind", () => {
    expect(valid(readRepeatedZeroHits([]))).toMatchObject({ applicability: "notApplicable" })
    expect(valid(readNoopRewrites([memoryEvent({ changeKind: "read" })]))).toMatchObject({
      applicability: "notApplicable",
    })
  })
})

describe("recovery readers", () => {
  const spans: CriticalPathSpanInput[] = [
    {
      traceId: "trace-1",
      spanId: "root",
      parentSpanId: "",
      operation: "invoke_agent",
      startTime: at(0),
      endTime: at(1_000),
    },
    {
      traceId: "trace-1",
      spanId: "failed",
      parentSpanId: "root",
      operation: "chat",
      startTime: at(100),
      endTime: at(300),
    },
    {
      traceId: "trace-1",
      spanId: "retry",
      parentSpanId: "root",
      operation: "chat",
      startTime: at(300),
      endTime: at(700),
    },
  ]
  const path = buildTraceCriticalPath({ traceId: "trace-1", spans })
  const incident = { traceId: "trace-1", spanId: "failed", kind: "rateLimit", retrySpanIds: ["retry"] }

  it("is a session-grained rate over completed sessions", () => {
    expect(valid(readRecoveredIncidentRate({ completed: true, recovered: [incident] }))).toMatchObject({
      rawValue: 1,
      eligibleUnits: 1,
      adverseUnits: 1,
      rawUnit: "completedSessions",
    })
    expect(valid(readRecoveredIncidentRate({ completed: true, recovered: [] })).adverseUnits).toBe(0)
  })

  it("is not applicable without a completion and unreadable when completion is unknown", () => {
    expect(valid(readRecoveredIncidentRate({ completed: false, recovered: [incident] }))).toMatchObject({
      applicability: "notApplicable",
    })
    expect(valid(readRecoveredIncidentRate({ completed: null, recovered: [] }))).toMatchObject({
      readability: "unreadable",
    })
  })

  it("claims the retry generations and never the failed call's own spend", () => {
    expect(recoverySpendClaims([incident])).toEqual([{ spanId: "retry", cause: "recovered:rateLimit" }])
  })

  it("takes only the marginal path time the retries actually held", () => {
    expect(recoveryAvoidableNs({ recovered: [incident], paths: [path] })).toBe(400 * 1_000_000)
  })

  it("counts a retry claimed by two incidents once", () => {
    const shared = { ...incident, kind: "overload" }

    expect(recoveryAvoidableNs({ recovered: [incident, shared], paths: [path] })).toBe(400 * 1_000_000)
  })

  it("contributes nothing when the trace has no usable path", () => {
    expect(recoveryAvoidableNs({ recovered: [incident], paths: [] })).toBe(0)
  })
})
