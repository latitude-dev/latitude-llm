import { createHash } from "node:crypto"
import { IMPORT_ID_NAMESPACE, type ImportSource } from "@domain/imports"
import type { OrganizationId, ProjectId } from "@domain/shared"
import {
  parseMessagePayload,
  resolveErrorTypeFromMetadata,
  resolveReportedPerformance,
  resolveSpanCost,
  resolveToolDefinitionsFromMetadata,
  resolveToolExecutionFromMetadata,
  type SpanDetail,
  type SpanTokenCounts,
  toolDefinitionsFrom,
  usdToMicrocents,
} from "@domain/spans"

/**
 * Cost a source reports itself, in USD. A side the source does not break out is left out entirely
 * rather than sent as zero: zero is a source pricing the call at nothing, which is a different claim
 * from saying nothing, and only the omission lets the missing side be estimated.
 */
interface ReportedCost {
  readonly inputUsd?: number | undefined
  readonly outputUsd?: number | undefined
  readonly totalUsd?: number | undefined
}

interface NormalizedSpanInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly source: ImportSource
  readonly traceIdSource: string
  readonly spanIdSource: string
  readonly parentSpanIdSource?: string | null
  readonly sessionId: string
  readonly userId: string
  readonly userEmail?: string
  readonly name: string
  readonly operation: string
  readonly model: string
  /** Needed to price the span: models.dev keys on the provider/model pair, not the model alone. */
  readonly provider?: string
  readonly tags: readonly string[]
  readonly metadata: Record<string, string>
  readonly startTime: Date
  readonly endTime: Date
  readonly ingestedAt: Date
  readonly retentionDays: number
  readonly statusCode: SpanDetail["statusCode"]
  readonly statusMessage: string
  readonly errorType?: string
  readonly tokensInput?: number
  readonly tokensOutput?: number
  readonly tokens?: SpanTokenCounts
  readonly cost?: ReportedCost
  /** When the first output token arrived, from which TTFT and the streaming flag follow. */
  readonly firstTokenAt?: Date
  readonly timeToFirstTokenNs?: number
  readonly isStreaming?: boolean
  readonly responseId?: string
  readonly finishReasons?: readonly string[]
  /** The instrumentation that produced the row, where the source records one. */
  readonly scopeName?: string
  readonly scopeVersion?: string
  readonly eventsJson?: string
  /** Where the source declares the call's tools, when that is not the input payload itself. */
  readonly toolsPayload?: unknown
  readonly input?: unknown
  readonly output?: unknown
}

/**
 * Maps a vendor id onto an OTEL-shaped hex id, deterministically so re-runs dedupe
 * through ClickHouse's ReplacingMergeTree. An id that is already the right width in
 * hex (dashes stripped) is kept verbatim, which keeps OTEL-native vendor ids stitched
 * to any spans of the same trace that arrived over live OTLP. Anything else is hashed
 * under a namespace that includes the source, so two vendors reusing an id string
 * cannot collapse into one Latitude trace.
 */
export const mapSourceId = (
  kind: "trace" | "span",
  source: ImportSource,
  sourceId: string,
  length: 16 | 32,
): string => {
  const bare = sourceId.replaceAll("-", "").toLowerCase()
  if (bare.length === length && /^[0-9a-f]+$/.test(bare)) return bare
  return createHash("sha256")
    .update(`${IMPORT_ID_NAMESPACE}:${kind}:${source}:${sourceId}`)
    .digest("hex")
    .slice(0, length)
}

/**
 * USD as microcents, or `undefined` when the source stated nothing usable. A real zero survives, so
 * a source pricing a call at nothing still reads as a price rather than as a gap in our pricing.
 */
const reportedMicrocents = (usd: number | undefined): number | undefined =>
  typeof usd === "number" && Number.isFinite(usd) && usd >= 0 ? usdToMicrocents(usd) : undefined

/** The source's own figures in the units the shared cost policy resolves over. */
const resolveCost = (input: NormalizedSpanInput, tokens: SpanTokenCounts) =>
  resolveSpanCost({
    reported: {
      inputMicrocents: reportedMicrocents(input.cost?.inputUsd),
      outputMicrocents: reportedMicrocents(input.cost?.outputUsd),
      totalMicrocents: reportedMicrocents(input.cost?.totalUsd),
    },
    provider: input.provider ?? "",
    model: input.model,
    tokens,
  })

/**
 * A source that breaks cache and reasoning out wins; one that reports only two totals gets
 * them stored as-is.
 *
 * The flat pair is deliberately not split on a guess. `input` is inclusive of cached tokens for
 * most providers and additive for others, and ingest needs the provider plus the matched
 * attribute key plus a total to tell which (`resolveTokens`). Subtracting on a hunch would move
 * tokens out of the count the trace rollup bills on. An adapter passes `tokens` only where the
 * source documents which convention it uses.
 */
const resolveReportedTokens = (input: NormalizedSpanInput): SpanTokenCounts =>
  input.tokens ?? {
    tokensInput: input.tokensInput ?? 0,
    tokensOutput: input.tokensOutput ?? 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
  }

const NO_CONTENT: Pick<SpanDetail, "inputMessages" | "outputMessages" | "systemInstructions"> = {
  inputMessages: [],
  outputMessages: [],
  systemInstructions: [],
}

export const buildSpanFromNormalized = (input: NormalizedSpanInput): SpanDetail => {
  const payload = { input: input.input, output: input.output }
  // The same rosetta-ai translation live ingestion runs on an opaque `input.value` payload, so
  // a conversation recorded by any of the providers rosetta knows lands as real messages rather
  // than a JSON blob rendered as text. A tool span is the exception: its payload is arguments
  // and a result, which belong in the tool columns the span detail reads, and rendering them as
  // messages as well would invent a conversation turn that never happened.
  const content = input.operation === "execute_tool" ? NO_CONTENT : parseMessagePayload(payload)
  const toolDefinitions = toolDefinitionsFrom(
    input.toolsPayload,
    resolveToolDefinitionsFromMetadata(input.metadata),
    input.input,
    input.output,
  )
  const tokens = resolveReportedTokens(input)
  const cost = resolveCost(input, tokens)
  const performance = resolveReportedPerformance(input)

  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId as SpanDetail["sessionId"],
    userId: input.userId as SpanDetail["userId"],
    userEmail: input.userEmail ?? "",
    traceId: mapSourceId("trace", input.source, input.traceIdSource, 32) as SpanDetail["traceId"],
    spanId: mapSourceId("span", input.source, input.spanIdSource, 16) as SpanDetail["spanId"],
    parentSpanId: input.parentSpanIdSource ? mapSourceId("span", input.source, input.parentSpanIdSource, 16) : "",
    // No Latitude key sent these spans and no simulation produced them.
    apiKeyId: "",
    simulationId: "",
    startTime: input.startTime,
    endTime: input.endTime,
    name: input.name,
    // OTEL-only concepts. There was no resource, span kind, trace context or link set to read,
    // and defaulting them to something plausible would misattribute the trace.
    serviceName: "",
    kind: "internal",
    traceFlags: 0,
    traceState: "",
    linksJson: "[]",
    statusMessage: input.statusMessage,
    errorType: input.statusCode === "error" ? input.errorType || resolveErrorTypeFromMetadata(input.metadata) : "",
    statusCode: input.statusCode,
    tags: [...input.tags],
    metadata: input.metadata,
    eventsJson: input.eventsJson ?? "[]",
    operation: input.operation,
    provider: input.provider ?? "",
    model: input.model,
    // No source distinguishes the model asked for from the one that answered.
    responseModel: input.model,
    // Sources name an agent span after the agent, the same way they name a tool span after
    // the tool.
    agentName: input.operation === "invoke_agent" ? input.name : "",
    finishReasons: [...(input.finishReasons ?? [])],
    ...tokens,
    ...cost,
    ...performance,
    responseId: input.responseId ?? "",
    // A vendor row carries no OTEL attributes; its own fields go to `metadata` instead.
    attrString: {},
    attrInt: {},
    attrFloat: {},
    attrBool: {},
    resourceString: {},
    scopeName: input.scopeName ?? "",
    scopeVersion: input.scopeVersion ?? "",
    ingestedAt: input.ingestedAt,
    retentionDays: input.retentionDays,
    inputMessages: content.inputMessages,
    outputMessages: content.outputMessages,
    systemInstructions: content.systemInstructions,
    toolDefinitions,
    toolNames: toolDefinitions.map((definition) => definition.name),
    ...resolveToolExecutionFromMetadata({
      metadata: input.metadata,
      operation: input.operation,
      spanName: input.name,
      input: input.input,
      output: input.output,
    }),
  }
}
