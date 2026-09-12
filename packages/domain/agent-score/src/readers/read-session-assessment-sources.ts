import type { SessionMomentLabel, SessionSemanticMoment } from "@domain/conversation-intelligence"
import {
  buildFlaggerSessionContext,
  emptyResponseStrategy,
  extractUserTextMessages,
  FLAGGER_DISPLAY,
  type FlaggerFinding,
  type FlaggerSlug,
  type FlaggerStrategy,
  lowCacheHitRateStrategy,
  outputSchemaValidationStrategy,
  readDeterministicFlaggerFindings,
  toolCallErrorsStrategy,
  trashingStrategy,
} from "@domain/flaggers"
import type { MemoryEvent } from "@domain/memories"
import { countTokens } from "@domain/memories"
import { isConfirmedHarmFindingKind, type Score } from "@domain/scores"
import type { ScoreDimension } from "@domain/shared"
import type { SignalWithLifecycle } from "@domain/signals"
import {
  classifySpanEndpoint,
  hasUsableAssistantCompletion,
  isLlmCompletionOperation,
  resolveSessionSpanEndpoints,
  type SessionDetail,
  type SessionGenerationFact,
  type SessionToolCallFact,
  type Span,
  sessionConversationMessages,
} from "@domain/spans"
import { Effect } from "effect"
import type { LatencyReferenceArtifact } from "../entities/latency-reference-artifact.ts"
import type { SessionEvidenceAnchor, SessionEvidenceDestination } from "../entities/session-assessment.ts"
import type {
  AssessmentFinding,
  AssessmentReaderFact,
  NormalizedSessionAssessmentInput,
} from "../entities/session-assessment-input.ts"
import type { SessionMomentFacts } from "../ports/session-assessment-sources.ts"
import type { RecoveredIncident } from "./cost/read-recovery-metrics.ts"
import type { RecoveredStructuralDefect, ToolDefinitionSurface } from "./cost/read-tool-metrics.ts"
import { buildSessionCacheEvidence, readSessionCostEvidence } from "./read-session-cost-evidence.ts"

const DETERMINISTIC_READERS = [
  {
    strategy: emptyResponseStrategy,
    readerId: "sessions.no_output",
    label: "Delivered output",
    scoreDimensions: ["outcome", "reliability"],
  },
  {
    strategy: toolCallErrorsStrategy,
    readerId: "tools.call_and_structure",
    label: "Tool-call failures",
    scoreDimensions: ["reliability", "cost", "speed"],
  },
  {
    strategy: outputSchemaValidationStrategy,
    readerId: "output.schema_damage",
    label: "Output structure",
    scoreDimensions: ["outcome", "reliability"],
  },
  {
    strategy: trashingStrategy,
    readerId: "tools.thrashing",
    label: "Repeated tool calls",
    scoreDimensions: ["cost", "speed"],
  },
  {
    strategy: lowCacheHitRateStrategy,
    readerId: "cost.cache_gap",
    label: "Prompt cache use",
    scoreDimensions: ["cost"],
  },
] as const satisfies readonly {
  readonly strategy: FlaggerStrategy
  readonly readerId: string
  readonly label: string
  readonly scoreDimensions: readonly ScoreDimension[]
}[]

const latestTraceId = (session: SessionDetail, spans: readonly Span[]): string => {
  const latestGeneration = [...spans]
    .filter(
      (span) =>
        span.operation === "chat" || span.operation === "text_completion" || span.operation === "generate_content",
    )
    .sort(
      (left, right) =>
        right.endTime.getTime() - left.endTime.getTime() || right.startTime.getTime() - left.startTime.getTime(),
    )[0]
  return latestGeneration?.traceId ?? session.traceIds.at(-1) ?? session.sessionId
}

type MessageFlaggerFinding = Extract<FlaggerFinding, { readonly messageIndex: number }>

const messageReferences = (finding: MessageFlaggerFinding, traceId: string) => {
  const anchor = {
    kind: "message" as const,
    traceId,
    messageIndex: finding.messageIndex,
    ...(finding.partIndex !== undefined ? { partIndex: finding.partIndex } : {}),
  }
  return {
    chronology: { messageIndex: finding.messageIndex },
    anchors: [anchor],
    destinations: [
      {
        kind: "sessionMessage" as const,
        traceId,
        messageIndex: finding.messageIndex,
        ...(finding.partIndex !== undefined ? { partIndex: finding.partIndex } : {}),
      },
    ],
  }
}

const flaggerFindingLabel = (finding: FlaggerFinding): string => {
  switch (finding.findingKind) {
    case "blank":
      return "No assistant output"
    case "confirmedUnusablePattern":
      return "Assistant output was unusable"
    case "unconfirmedPattern":
      return "Assistant output may be unusable"
    case "trailingComma":
      return "Response contained a trailing JSON comma"
    case "unclosedString":
      return "Response ended with an unfinished string"
    case "invalidJson":
      return "Response was not valid JSON"
    case "error":
      return `${finding.toolName} failed`
    case "malformed":
      return `${finding.toolName ?? "Tool call"} was malformed`
    case "duplicate":
      return `${finding.toolName} reused a call ID`
    case "undeclared":
      return `${finding.toolName} was not declared`
    case "unknown-id":
      return "Tool response did not match a call"
    case "identicalCallLoop":
      return "Repeated identical tool calls"
    case "lowCacheHitRate":
      return "Prompt cache use was low"
  }
}

const findingBase = (finding: FlaggerFinding, traceId: string) => {
  const references =
    "messageIndex" in finding
      ? messageReferences(finding as MessageFlaggerFinding, traceId)
      : { chronology: {}, anchors: [], destinations: [] }
  const label = flaggerFindingLabel(finding)
  return {
    evidenceKey: finding.findingKey,
    label,
    ...(finding.feedback.trim() !== label ? { description: finding.feedback } : {}),
    source: "metric" as const,
    signalIds: [],
    scoreIds: [],
    occurrenceCount: "occurrenceCount" in finding ? finding.occurrenceCount : 1,
    ...references,
    independentHumanEvidence: false,
  }
}

const toolCallReferences = (
  finding: Extract<FlaggerFinding, { readonly flaggerSlug: "tool-call-errors" }>,
  traceId: string,
  base: ReturnType<typeof findingBase>,
) => {
  if (!("toolCallId" in finding) || !finding.toolCallId) {
    return { anchors: base.anchors, destinations: base.destinations }
  }
  return {
    anchors: [
      ...base.anchors,
      {
        kind: "toolCall" as const,
        traceId,
        toolCallId: finding.toolCallId,
        ...("toolName" in finding && finding.toolName ? { toolName: finding.toolName } : {}),
        messageIndex: finding.messageIndex,
      },
    ],
    destinations: [...base.destinations, { kind: "toolCall" as const, traceId, toolCallId: finding.toolCallId }],
  }
}

const normalizeFlaggerFinding = (
  finding: FlaggerFinding,
  traceId: string,
  hasCompletion: boolean,
): AssessmentFinding => {
  const base = findingBase(finding, traceId)
  switch (finding.flaggerSlug) {
    case "empty-response":
      return { ...base, metricId: "sessions.no_output", kind: "noOutput", findingKind: finding.findingKind }
    case "output-schema-validation":
      return {
        ...base,
        metricId: "spans.finish_failure",
        kind: "outputDamage",
        findingKind: finding.findingKind,
        generationPosition: finding.generationPosition,
      }
    case "tool-call-errors": {
      const references = toolCallReferences(finding, traceId, base)
      if (finding.findingKind === "error") {
        return {
          ...base,
          metricId: "tools.call_failed",
          kind: "toolFailure",
          recovered: finding.recovered ?? hasCompletion,
          ...(finding.sameSubjectRecovered !== undefined ? { sameSubjectRecovered: finding.sameSubjectRecovered } : {}),
          terminal: finding.terminal ?? !hasCompletion,
          ...references,
        }
      }
      return {
        ...base,
        metricId: "tools.structural_defect",
        kind: "toolStructuralDefect",
        findingKind: finding.findingKind,
        terminal: !hasCompletion,
        ...references,
      }
    }
    case "trashing":
      return { ...base, metricId: "tools.thrashing", kind: "toolRepetition", redundancy: "unconfirmed" }
    case "low-cache-hit-rate":
      return { ...base, metricId: "cost.cache_gap", kind: "cacheGap" }
  }
}

const readDeterministicFindings = (session: SessionDetail, spans: readonly Span[]) => {
  const traceId = latestTraceId(session, spans)
  const context = buildFlaggerSessionContext(session, traceId)
  const hasCompletion = hasUsableAssistantCompletion(session.outputMessages)
  return Effect.all(
    DETERMINISTIC_READERS.map((reader) =>
      readDeterministicFlaggerFindings(reader.strategy, {
        scope: {
          organizationId: session.organizationId,
          projectId: session.projectId,
          sessionId: session.sessionId,
        },
        conversation: context.conversation,
      }).pipe(Effect.map((read) => ({ reader, read }))),
    ),
  ).pipe(
    Effect.map((reads) => ({
      findings: reads.flatMap(({ read }) =>
        read.readable ? read.findings.map((finding) => normalizeFlaggerFinding(finding, traceId, hasCompletion)) : [],
      ),
      readers: reads.map(
        ({ reader, read }): AssessmentReaderFact => ({
          readerId: reader.readerId,
          label: reader.label,
          scoreDimensions: reader.scoreDimensions,
          applicable: read.readable,
          findingCount: read.findings.length,
          readableCount: read.readable ? 1 : 0,
          totalCount: 1,
          ...(!read.readable ? { limitation: "missingTelemetry" as const } : {}),
        }),
      ),
    })),
  )
}

const spanById = (spans: readonly Span[]) => new Map(spans.map((span) => [`${span.traceId}:${span.spanId}`, span]))

const readSpanFindings = (
  session: SessionDetail,
  spans: readonly Span[],
  deterministic: readonly AssessmentFinding[],
) => {
  const resolution = resolveSessionSpanEndpoints({ spans, outputMessages: session.outputMessages })
  const spansById = spanById(spans)
  const hasFinalOutputDamage = deterministic.some(
    (finding) => finding.kind === "outputDamage" && finding.generationPosition === "final",
  )
  const findings: AssessmentFinding[] = []

  for (const endpoint of resolution.generationEndpoints) {
    const span = spansById.get(`${endpoint.traceId}:${endpoint.spanId}`)
    if (!span) continue
    for (const reason of endpoint.finishReasons) {
      if (reason.classification !== "unreliable") continue
      if (reason.requiresOutputDamage && !(endpoint.generationPosition === "final" && hasFinalOutputDamage)) continue
      findings.push({
        evidenceKey: `span:${endpoint.spanId}:finish:${reason.kind}`,
        label: `Generation ended with ${reason.kind}`,
        description: reason.rawValue,
        source: "metric",
        metricId: "spans.finish_failure",
        signalIds: [],
        scoreIds: [],
        occurrenceCount: 1,
        chronology: { occurredAt: endpoint.endTime },
        anchors: [{ kind: "span", traceId: endpoint.traceId, spanId: endpoint.spanId }],
        destinations: [{ kind: "span", traceId: endpoint.traceId, spanId: endpoint.spanId }],
        independentHumanEvidence: false,
        kind: "finishFailure",
        findingKind: reason.kind,
        generationPosition: endpoint.generationPosition,
        observedMicrocents: span.costTotalMicrocents,
        observedNs: Math.max(0, endpoint.endTime.getTime() - endpoint.startTime.getTime()) * 1_000_000,
      })
    }
  }

  for (const finding of resolution.providerErrorFindings) {
    const span = spansById.get(`${finding.traceId}:${finding.spanId}`)
    const successful = resolution.generationEndpoints.find(
      (endpoint) => endpoint.spanIndex === finding.successfulSpanIndex,
    )
    findings.push({
      evidenceKey: `span:${finding.spanId}:provider-error:${finding.error.kind}`,
      label: `Provider ${finding.error.kind}`,
      description: finding.error.rawValue,
      source: "metric",
      metricId: "spans.provider_error",
      signalIds: [],
      scoreIds: [],
      occurrenceCount: 1,
      chronology: { ...(span ? { occurredAt: span.endTime } : {}) },
      anchors: [{ kind: "span", traceId: finding.traceId, spanId: finding.spanId }],
      destinations: [{ kind: "span", traceId: finding.traceId, spanId: finding.spanId }],
      independentHumanEvidence: false,
      kind: "providerError",
      findingKind: finding.error.kind,
      recovered: finding.recovered,
      sameSubjectRecovered: finding.sameSubjectRecovered,
      terminal: finding.terminal,
      ...(successful ? { successfulSpanId: successful.spanId } : {}),
      observedMicrocents: finding.costTotalMicrocents,
      observedNs: finding.observedDurationNs,
    })
  }

  const unmappedFinishReasons = resolution.generationEndpoints
    .flatMap((endpoint) => endpoint.finishReasons)
    .filter((reason) => reason.classification === "unmapped").length
  const unmappedProviderErrors = resolution.generationEndpoints.filter(
    (endpoint) => endpoint.providerError?.classification === "unmapped",
  ).length
  const generationCount = resolution.generationEndpoints.length

  return {
    findings,
    readers: [
      {
        readerId: "spans.finish_failure",
        label: "Generation finish reasons",
        scoreDimensions: ["outcome", "reliability", "speed"],
        applicable: generationCount > 0,
        findingCount: findings.filter((finding) => finding.kind === "finishFailure").length,
        readableCount: generationCount - unmappedFinishReasons,
        totalCount: generationCount,
        ...(unmappedFinishReasons > 0 ? { limitation: "unmappedTelemetry" as const } : {}),
      },
      {
        readerId: "spans.provider_error",
        label: "Provider errors",
        scoreDimensions: ["reliability", "cost", "speed"],
        applicable: generationCount > 0,
        findingCount: resolution.providerErrorFindings.length,
        readableCount: generationCount - unmappedProviderErrors,
        totalCount: generationCount,
        ...(unmappedProviderErrors > 0 ? { limitation: "unmappedTelemetry" as const } : {}),
      },
    ] satisfies AssessmentReaderFact[],
  }
}

const scoreAnchors = (score: Score) => {
  const anchors: SessionEvidenceAnchor[] = [{ kind: "score", scoreId: score.id }]
  const destinations: SessionEvidenceDestination[] = [{ kind: "score", scoreId: score.id }]
  if (score.traceId && score.sourceType === "annotation" && score.metadata.messageIndex !== undefined) {
    anchors.push({
      kind: "message",
      traceId: score.traceId,
      messageIndex: score.metadata.messageIndex,
      ...(score.metadata.partIndex !== undefined ? { partIndex: score.metadata.partIndex } : {}),
      ...(score.metadata.contentHash ? { contentHash: score.metadata.contentHash } : {}),
    })
    destinations.push({
      kind: "sessionMessage",
      traceId: score.traceId,
      messageIndex: score.metadata.messageIndex,
      ...(score.metadata.partIndex !== undefined ? { partIndex: score.metadata.partIndex } : {}),
    })
  }
  return { anchors, destinations }
}

const flaggerLabel = (slug: string | undefined): string | undefined =>
  slug === undefined ? undefined : (FLAGGER_DISPLAY[slug as FlaggerSlug]?.name ?? slug)

const readScoreFindings = (scores: readonly Score[], signals: readonly SignalWithLifecycle[]): AssessmentFinding[] => {
  const signalsById = new Map<string, SignalWithLifecycle>(signals.map((signal) => [signal.id, signal]))
  return scores.flatMap((score): AssessmentFinding[] => {
    if (score.draftedAt || score.errored) return []
    const signal = score.signalId ? signalsById.get(score.signalId) : undefined
    if (signal?.ignoredAt) return []
    const metadata = score.sourceType === "annotation" ? score.metadata : undefined
    const evidenceKey = metadata?.flaggerFindingKey ?? `score:${score.id}`
    const signalIds = signal ? [signal.id] : []
    const references = scoreAnchors(score)
    const base = {
      evidenceKey,
      label: signal?.name ?? flaggerLabel(metadata?.flaggerSlug) ?? "Score",
      ...(score.feedback ? { description: score.feedback } : {}),
      source: signal ? ("signal" as const) : metadata?.flaggerSlug ? ("flagger" as const) : ("score" as const),
      signalIds,
      scoreIds: [score.id],
      occurrenceCount: 1,
      chronology: {
        occurredAt: score.createdAt,
        ...(metadata?.messageIndex !== undefined ? { messageIndex: metadata.messageIndex } : {}),
      },
      ...references,
      independentHumanEvidence:
        score.annotatorId !== null || (score.sourceType === "annotation" && score.sourceId !== "SYSTEM"),
    }

    if (metadata?.flaggerSlug === "task-failure") {
      return [
        {
          ...base,
          metricId: "sessions.task_success",
          kind: "taskOutcome",
          verdict: score.passed ? "success" : "failure",
        },
      ]
    }
    // The structured finding outranks the signal's model-assigned roles below:
    // it names the assistant-side evidence, which is what turns a Safety
    // classification into a confirmation.
    if (metadata?.safetyFindingKind) {
      return [
        {
          ...base,
          ...(isConfirmedHarmFindingKind(metadata.safetyFindingKind) ? { metricId: "safety.confirmed_failure" } : {}),
          kind: "safetyFinding",
          findingKind: metadata.safetyFindingKind,
        },
      ]
    }
    if (signal && signal.scoreEvidence.length > 0) {
      return [
        {
          ...base,
          kind: "classifiedJudgment",
          roles: signal.scoreEvidence,
          negative: !score.passed,
          judgmentKind: score.sourceType,
          signalOrigin: signal.origin,
          ...(metadata?.flaggerSlug ? { findingKind: metadata.flaggerSlug } : {}),
        },
      ]
    }
    return [
      {
        ...base,
        kind: "standaloneScore",
        negative: !score.passed,
        judgmentKind: score.sourceType,
        ...(signal ? { signalOrigin: signal.origin } : {}),
      },
    ]
  })
}

const readMomentFindings = (facts: SessionMomentFacts): AssessmentFinding[] => {
  const momentsById = new Map(facts.moments.map((moment) => [moment.momentId, moment]))
  const labelsByMoment = new Map<string, SessionMomentLabel[]>()
  for (const label of facts.labels) {
    const labels = labelsByMoment.get(label.momentId) ?? []
    labels.push(label)
    labelsByMoment.set(label.momentId, labels)
  }

  return [...labelsByMoment.entries()].flatMap(([momentId, labels]): AssessmentFinding[] => {
    const moment: SessionSemanticMoment | undefined = momentsById.get(momentId)
    if (!moment) return []
    const first = labels[0]
    return [
      {
        evidenceKey: `moment:${momentId}`,
        label: first?.summary || "Conversation moment",
        source: "moment",
        metricId: "moments.conversation",
        signalIds: [],
        scoreIds: [],
        occurrenceCount: 1,
        chronology: {
          occurredAt: moment.startTime,
          ...(first ? { messageIndex: first.firstMessageIndex } : {}),
        },
        anchors: [
          {
            kind: "message",
            traceId: moment.traceId,
            messageIndex: first?.firstMessageIndex ?? moment.firstMessageIndex,
          },
        ],
        destinations: [
          {
            kind: "sessionMessage",
            traceId: moment.traceId,
            messageIndex: first?.firstMessageIndex ?? moment.firstMessageIndex,
          },
        ],
        independentHumanEvidence: false,
        kind: "moment",
        momentKinds: [...new Set(labels.map((label) => label.kind))],
      },
    ]
  })
}

const isSuccessfulGeneration = (generation: SessionGenerationFact): boolean => {
  const endpoint = classifySpanEndpoint(generation)
  return (
    generation.statusCode !== "error" &&
    endpoint.providerError === null &&
    endpoint.finishReasons.every((reason) => reason.classification === "clean")
  )
}

const retrySpanIdsThrough = ({
  generations,
  traceId,
  after,
  successfulSpanId,
}: {
  readonly generations: readonly SessionGenerationFact[]
  readonly traceId: string
  readonly after: Date
  readonly successfulSpanId?: string
}): string[] => {
  const candidates = generations
    .filter(
      (generation) =>
        generation.traceId === traceId &&
        isLlmCompletionOperation(generation.operation) &&
        generation.startTime.getTime() >= after.getTime(),
    )
    .sort(
      (left, right) =>
        left.startTime.getTime() - right.startTime.getTime() ||
        left.endTime.getTime() - right.endTime.getTime() ||
        left.spanId.localeCompare(right.spanId),
    )
  const successfulIndex = successfulSpanId
    ? candidates.findIndex((generation) => generation.spanId === successfulSpanId)
    : candidates.findIndex(isSuccessfulGeneration)
  return successfulIndex < 0
    ? []
    : candidates.slice(0, successfulIndex + 1).map((generation) => generation.spanId as string)
}

const recoveredProviderIncident = (
  finding: Extract<AssessmentFinding, { readonly kind: "providerError" }>,
  generations: readonly SessionGenerationFact[],
): RecoveredIncident[] => {
  if (!finding.recovered || finding.terminal || !finding.successfulSpanId) return []
  const anchor = finding.anchors.find((candidate) => candidate.kind === "span")
  if (anchor?.kind !== "span") return []
  const failed = generations.find(
    (generation) => generation.traceId === anchor.traceId && generation.spanId === anchor.spanId,
  )
  if (!failed) return []
  const retrySpanIds = retrySpanIdsThrough({
    generations,
    traceId: anchor.traceId,
    after: failed.endTime,
    successfulSpanId: finding.successfulSpanId,
  })
  return retrySpanIds.length === 0
    ? []
    : [{ traceId: anchor.traceId, spanId: anchor.spanId, kind: finding.findingKind, retrySpanIds }]
}

const recoveredToolIncident = (
  finding: Extract<AssessmentFinding, { readonly kind: "toolFailure" }>,
  generations: readonly SessionGenerationFact[],
  toolCalls: readonly SessionToolCallFact[],
): RecoveredIncident[] => {
  if (!finding.recovered || finding.terminal) return []
  const anchor = finding.anchors.find((candidate) => candidate.kind === "toolCall")
  if (anchor?.kind !== "toolCall") return []
  const failed = toolCalls.find(
    (toolCall) => toolCall.traceId === anchor.traceId && toolCall.toolCallId === anchor.toolCallId,
  )
  if (!failed) return []
  const retrySpanIds = retrySpanIdsThrough({
    generations,
    traceId: anchor.traceId,
    after: failed.endTime,
  })
  return retrySpanIds.length === 0
    ? []
    : [
        {
          traceId: anchor.traceId,
          spanId: failed.spanId,
          kind: "toolFailure",
          retrySpanIds,
        },
      ]
}

/**
 * The recovered incidents Cost and Speed may charge, with the retries that got past them.
 *
 * The retry set ends at the successful generation and contains only LLM completion spans. The
 * failed span itself is deliberately absent because its cost belongs to Reliability.
 */
const recoveredIncidentsFrom = (
  findings: readonly AssessmentFinding[],
  generations: readonly SessionGenerationFact[],
  toolCalls: readonly SessionToolCallFact[],
): RecoveredIncident[] =>
  findings.flatMap((finding): RecoveredIncident[] => {
    if (finding.kind === "providerError") return recoveredProviderIncident(finding, generations)
    if (finding.kind === "toolFailure") return recoveredToolIncident(finding, generations, toolCalls)
    return []
  })

const recoveredDefectsFrom = (
  findings: readonly AssessmentFinding[],
  toolCalls: readonly SessionToolCallFact[],
): RecoveredStructuralDefect[] =>
  findings.flatMap((finding) => {
    if (finding.kind !== "toolStructuralDefect" || finding.terminal) return []
    const anchor = finding.anchors.find((candidate) => candidate.kind === "toolCall")
    if (anchor?.kind !== "toolCall") return []
    const toolCall = toolCalls
      .filter((candidate) => candidate.traceId === anchor.traceId && candidate.toolCallId === anchor.toolCallId)
      .sort((left, right) => left.startTime.getTime() - right.startTime.getTime())
      .at(-1)
    return toolCall ? [{ traceId: toolCall.traceId, spanId: toolCall.spanId, findingKind: finding.findingKind }] : []
  })

/**
 * Tool definitions the session offered, with how many readable requests carried each.
 *
 * A definition present in every captured request has a complete observation period *for this
 * session*; whether it is dead across the window is a question only the window can answer, which is
 * why the reader treats an incomplete period as not applicable rather than as unused.
 */
const toolDefinitionSurfaces = ({
  generations,
  toolCalls,
}: {
  readonly generations: readonly SessionGenerationFact[]
  readonly toolCalls: readonly SessionToolCallFact[]
}): { readonly definitions: ToolDefinitionSurface[]; readonly unmatchedCallNames: string[] } => {
  const captured = generations.filter((generation) => generation.content !== null)
  const requestsByName = new Map<string, number>()
  const tokensByName = new Map<string, number>()
  for (const generation of captured) {
    for (const definition of generation.content?.toolDefinitions ?? []) {
      requestsByName.set(definition.name, (requestsByName.get(definition.name) ?? 0) + 1)
      if (!tokensByName.has(definition.name)) {
        tokensByName.set(definition.name, countTokens(JSON.stringify(definition)))
      }
    }
  }
  const calledNames = new Set(toolCalls.map((call) => call.normalizedToolName))

  return {
    definitions: [...requestsByName.entries()].map(([name, requestCount]) => ({
      name,
      estimatedSerializedTokens: tokensByName.get(name) ?? 0,
      requestCount,
      calledAtLeastOnce: calledNames.has(name.toLowerCase()),
      observationPeriodComplete: requestCount === captured.length && captured.length > 0,
    })),
    unmatchedCallNames: [...calledNames].filter(
      (name) => ![...requestsByName.keys()].some((declared) => declared.toLowerCase() === name),
    ),
  }
}

/** Applied claims only: a dropped claim was time some other claim already accounted for. */
const avoidableNsByCause = (
  claims: readonly { readonly cause: string; readonly removedNs: number }[],
): Record<string, number> => {
  const byCause: Record<string, number> = {}
  for (const claim of claims) byCause[claim.cause] = (byCause[claim.cause] ?? 0) + claim.removedNs
  return byCause
}

export interface ReadSessionAssessmentSourcesInput {
  readonly session: SessionDetail
  readonly spans: readonly Span[]
  /** Compact Cost and Speed source facts; the readers that consume them land with their metrics. */
  readonly generations: readonly SessionGenerationFact[]
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly memoryEvents: readonly MemoryEvent[]
  readonly scores: readonly Score[]
  readonly signals: readonly SignalWithLifecycle[]
  readonly moments: SessionMomentFacts
  readonly screeningDecisions: NormalizedSessionAssessmentInput["screeningDecisions"]
  readonly latencyArtifact?: LatencyReferenceArtifact
}

export const readSessionAssessmentSources = (input: ReadSessionAssessmentSourcesInput) =>
  Effect.gen(function* () {
    const deterministic = yield* readDeterministicFindings(input.session, input.spans)
    const spanFindings = readSpanFindings(input.session, input.spans, deterministic.findings)
    const findings = [
      ...(hasUsableAssistantCompletion(input.session.outputMessages)
        ? [
            {
              evidenceKey: `session:${input.session.sessionId}:usable-completion`,
              label: "Usable completion delivered",
              source: "metric" as const,
              metricId: "sessions.usable_completion",
              signalIds: [],
              scoreIds: [],
              occurrenceCount: 1,
              chronology: { occurredAt: input.session.endTime },
              anchors: [],
              destinations: [],
              independentHumanEvidence: false,
              kind: "usableCompletion" as const,
            },
          ]
        : []),
      ...deterministic.findings,
      ...spanFindings.findings,
      ...readScoreFindings(input.scores, input.signals),
      ...readMomentFindings(input.moments),
    ]

    const surfaces = toolDefinitionSurfaces({ generations: input.generations, toolCalls: input.toolCalls })
    const costEvidence = readSessionCostEvidence({
      generations: input.generations,
      toolCalls: input.toolCalls,
      memoryEvents: input.memoryEvents,
      countTokens,
      completed: hasUsableAssistantCompletion(input.session.outputMessages),
      recoveredIncidents: recoveredIncidentsFrom(findings, input.generations, input.toolCalls),
      recoveredStructuralDefects: recoveredDefectsFrom(findings, input.toolCalls),
      toolDefinitions: surfaces.definitions,
      unmatchedToolCallNames: surfaces.unmatchedCallNames,
      cacheEvidence: buildSessionCacheEvidence(input.generations),
      ...(input.latencyArtifact ? { latencyArtifact: input.latencyArtifact } : {}),
    })

    return {
      sessionId: input.session.sessionId,
      hasReadableUserTask:
        extractUserTextMessages({ allMessages: sessionConversationMessages(input.session) }).length > 0,
      observedMicrocents: input.session.costTotalMicrocents,
      observedDurationNs: input.session.durationNs,
      findings,
      readers: [...deterministic.readers, ...spanFindings.readers, ...costEvidence.readers],
      screeningDecisions: input.screeningDecisions,
      costEvidence: {
        readings: costEvidence.readings,
        workloadStratum: costEvidence.workloadStratum,
        denominators: costEvidence.denominators,
        observedCriticalPathNs: costEvidence.criticalPath.observedNs,
        criticalPathComplete: costEvidence.criticalPath.completeness === "complete",
        measuredAvoidableNs: costEvidence.speed.measuredAvoidableNs,
        estimatedAvoidableNs: costEvidence.speed.estimatedAvoidableNs,
        measuredAvoidableMicrocents: 0,
        estimatedAvoidableMicrocents: 0,
        avoidableNsByCause: avoidableNsByCause(costEvidence.speed.appliedClaims),
      },
    } satisfies NormalizedSessionAssessmentInput
  })
