import type { SessionMomentLabel, SessionSemanticMoment } from "@domain/conversation-intelligence"
import {
  buildFlaggerSessionContext,
  classifyToolError,
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
import { type SignalWithLifecycle, scoringEligibleSignalIds } from "@domain/signals"
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
  const responseAnchor =
    finding.findingKind === "error"
      ? [
          {
            kind: "message" as const,
            traceId,
            messageIndex: finding.responseMessageIndex,
            ...(finding.responsePartIndex !== undefined ? { partIndex: finding.responsePartIndex } : {}),
          },
        ]
      : []
  return {
    anchors: [
      ...base.anchors,
      ...responseAnchor,
      {
        kind: "toolCall" as const,
        traceId,
        toolCallId: finding.toolCallId,
        ...("toolName" in finding && finding.toolName ? { toolName: finding.toolName } : {}),
        messageIndex: finding.findingKind === "error" ? finding.responseMessageIndex : finding.messageIndex,
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

const toolSpanReferences = (call: SessionToolCallFact) => {
  const span = { kind: "span" as const, traceId: call.traceId, spanId: call.spanId }
  if (call.toolCallId === "") {
    return { anchors: [span], destinations: [span] }
  }

  const toolCall = {
    kind: "toolCall" as const,
    traceId: call.traceId,
    toolCallId: call.toolCallId,
    ...(call.toolName ? { toolName: call.toolName } : {}),
  }
  return {
    anchors: [span, toolCall],
    destinations: [{ kind: "toolCall" as const, traceId: call.traceId, toolCallId: call.toolCallId }],
  }
}

const toolCallIdentity = ({ traceId, toolCallId }: { readonly traceId: string; readonly toolCallId: string }): string =>
  `${traceId}:${toolCallId}`

const toolSpanIdentity = ({ traceId, spanId }: { readonly traceId: string; readonly spanId: string }): string =>
  `${traceId}:${spanId}`

const toolCallsById = (toolCalls: readonly SessionToolCallFact[]): Map<string, SessionToolCallFact[]> => {
  const indexed = new Map<string, SessionToolCallFact[]>()
  for (const call of toolCalls) {
    if (call.toolCallId === "") continue
    const matches = indexed.get(call.toolCallId) ?? []
    matches.push(call)
    indexed.set(call.toolCallId, matches)
  }
  return indexed
}

const uniqueToolCallForFinding = (
  finding: Extract<AssessmentFinding, { readonly kind: "toolFailure" }>,
  indexed: ReadonlyMap<string, readonly SessionToolCallFact[]>,
): SessionToolCallFact | undefined => {
  const toolCallIds = new Set(
    finding.anchors.flatMap((anchor) => (anchor.kind === "toolCall" ? [anchor.toolCallId] : [])),
  )
  if (toolCallIds.size !== 1) return undefined
  const matches = indexed.get([...toolCallIds][0] ?? "") ?? []
  return matches.length === 1 ? matches.at(0) : undefined
}

const failedToolSpanIdentities = (findings: readonly AssessmentFinding[]): Set<string> => {
  const identities = new Set<string>()
  for (const finding of findings) {
    if (finding.kind !== "toolFailure") continue
    for (const anchor of finding.anchors) {
      if (anchor.kind === "span") identities.add(toolSpanIdentity(anchor))
    }
  }
  return identities
}

const retainedToolCallPosition = (
  finding: Extract<AssessmentFinding, { readonly kind: "toolFailure" }>,
  anchor: Extract<SessionEvidenceAnchor, { readonly kind: "toolCall" }>,
  session: SessionDetail,
): { readonly occurrence: number; readonly total: number } | undefined => {
  if (anchor.messageIndex === undefined) return undefined
  const responseAnchor = finding.anchors.find(
    (candidate) => candidate.kind === "message" && candidate.messageIndex === anchor.messageIndex,
  )
  let targetOccurrence: number | undefined
  let total = 0
  const pendingCalls: number[] = []
  const messages = sessionConversationMessages(session)
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex]
    if (!message) continue
    const parts = Array.isArray(message.parts) ? message.parts : []
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const part = parts[partIndex]
      if (typeof part !== "object" || part === null) continue
      if (!("id" in part) || typeof part.id !== "string" || part.id.trim() !== anchor.toolCallId) continue
      if ("type" in part && part.type === "tool_call") {
        pendingCalls.push(total)
        total++
        continue
      }
      if (!("type" in part) || part.type !== "tool_call_response") continue
      const callOccurrence = pendingCalls.shift()
      const isTarget =
        messageIndex === anchor.messageIndex &&
        (responseAnchor?.kind !== "message" ||
          responseAnchor.partIndex === undefined ||
          responseAnchor.partIndex === partIndex)
      if (isTarget) targetOccurrence = callOccurrence
    }
  }
  return targetOccurrence === undefined ? undefined : { occurrence: targetOccurrence, total }
}

const alignedRetainedResponseMatch = ({
  finding,
  anchor,
  session,
  orderedMatches,
}: {
  readonly finding: Extract<AssessmentFinding, { readonly kind: "toolFailure" }>
  readonly anchor: Extract<SessionEvidenceAnchor, { readonly kind: "toolCall" }>
  readonly session: SessionDetail
  readonly orderedMatches: readonly SessionToolCallFact[]
}): SessionToolCallFact | undefined => {
  const position = retainedToolCallPosition(finding, anchor, session)
  if (!position || position.total > orderedMatches.length) return undefined
  return orderedMatches[orderedMatches.length - position.total + position.occurrence]
}

const retainedConversationStartsAtSessionInput = (session: SessionDetail): boolean =>
  session.inputMessages.length > 0 &&
  session.inputMessages.every(
    (message, index) => JSON.stringify(message) === JSON.stringify(session.lastInputMessages[index]),
  )

const retainedConversationCutoff = (
  session: SessionDetail,
  generations: readonly SessionGenerationFact[],
): Date | undefined =>
  generations
    .filter(
      (generation) =>
        isLlmCompletionOperation(generation.operation) &&
        generation.content !== null &&
        JSON.stringify(generation.content.outputMessages) === JSON.stringify(session.outputMessages),
    )
    .sort((left, right) => right.startTime.getTime() - left.startTime.getTime())
    .at(0)?.startTime

const uniqueAlignedToolCallForFinding = (
  finding: Extract<AssessmentFinding, { readonly kind: "toolFailure" }>,
  indexed: ReadonlyMap<string, readonly SessionToolCallFact[]>,
  session: SessionDetail,
): SessionToolCallFact | undefined => {
  const uniqueMatch = uniqueToolCallForFinding(finding, indexed)
  if (!uniqueMatch) return undefined
  const anchors = finding.anchors.filter((anchor) => anchor.kind === "toolCall")
  const anchor = anchors.length === 1 ? anchors[0] : undefined
  if (anchor?.kind !== "toolCall") return uniqueMatch
  const position = retainedToolCallPosition(finding, anchor, session)
  if (!position) return uniqueMatch
  if (!retainedConversationStartsAtSessionInput(session)) return undefined
  return alignedRetainedResponseMatch({ finding, anchor, session, orderedMatches: [uniqueMatch] })
}

const resolveDeterministicToolReferences = (
  findings: readonly AssessmentFinding[],
  toolCalls: readonly SessionToolCallFact[],
  session: SessionDetail,
  generations: readonly SessionGenerationFact[],
): AssessmentFinding[] => {
  const retainedWindowComplete = retainedConversationStartsAtSessionInput(session)
  const retainedCutoff = retainedConversationCutoff(session, generations)
  const eligibleToolCalls = retainedCutoff
    ? toolCalls.filter((call) => call.endTime.getTime() <= retainedCutoff.getTime())
    : toolCalls
  const indexed = toolCallsById(eligibleToolCalls)
  const findingCountByIdentity = new Map<string, number>()
  for (const finding of findings) {
    if (finding.kind !== "toolFailure" || uniqueAlignedToolCallForFinding(finding, indexed, session)) continue
    const anchors = finding.anchors.filter((anchor) => anchor.kind === "toolCall")
    const anchor = anchors.length === 1 ? anchors[0] : undefined
    if (anchor?.kind !== "toolCall") continue
    const identity = toolCallIdentity(anchor)
    findingCountByIdentity.set(identity, (findingCountByIdentity.get(identity) ?? 0) + 1)
  }
  const matchedCountByIdentity = new Map<string, number>()
  const matchedSpanIdentities = new Set<string>()
  return findings.map((finding) => {
    if (finding.kind !== "toolFailure") return finding
    let matchingCall = uniqueAlignedToolCallForFinding(finding, indexed, session)
    if (!matchingCall) {
      const toolCallAnchors = finding.anchors.filter((anchor) => anchor.kind === "toolCall")
      const anchor = toolCallAnchors.length === 1 ? toolCallAnchors[0] : undefined
      if (anchor?.kind === "toolCall") {
        const identity = toolCallIdentity(anchor)
        const allOrderedMatches = (indexed.get(anchor.toolCallId) ?? []).sort(
          (left, right) =>
            left.startTime.getTime() - right.startTime.getTime() || left.spanId.localeCompare(right.spanId),
        )
        const responsePosition = retainedToolCallPosition(finding, anchor, session)
        const traceMatches = allOrderedMatches.filter((call) => call.traceId === anchor.traceId)
        const orderedMatches =
          retainedWindowComplete && responsePosition && traceMatches.length === responsePosition.total
            ? traceMatches
            : allOrderedMatches
        const matches = orderedMatches.filter((call) => !matchedSpanIdentities.has(toolSpanIdentity(call)))
        const matchedCount = matchedCountByIdentity.get(identity) ?? 0
        const remainingFindings = (findingCountByIdentity.get(identity) ?? 0) - matchedCount
        const responseMatch = alignedRetainedResponseMatch({ finding, anchor, session, orderedMatches })
        const responseMatchIsUnambiguous =
          responseMatch !== undefined &&
          responsePosition !== undefined &&
          ((retainedWindowComplete && orderedMatches.length === responsePosition.total) ||
            (!retainedWindowComplete && retainedCutoff !== undefined && orderedMatches.length > responsePosition.total))
        matchingCall =
          responseMatchIsUnambiguous && !matchedSpanIdentities.has(toolSpanIdentity(responseMatch))
            ? responseMatch
            : responseMatch !== undefined || (responsePosition && responsePosition.total > orderedMatches.length)
              ? undefined
              : matches.length <= remainingFindings
                ? matches[0]
                : (matches.find((call) => call.statusCode === "error") ?? matches[0])
        matchedCountByIdentity.set(identity, matchedCount + 1)
        if (matchingCall) matchedSpanIdentities.add(toolSpanIdentity(matchingCall))
      }
    }
    if (!matchingCall) return finding
    const references = toolSpanReferences(matchingCall)
    return {
      ...finding,
      evidenceKey: `span:${toolSpanIdentity(matchingCall)}:tool-failure:${finding.evidenceKey}`,
      anchors: [
        ...references.anchors,
        ...finding.anchors.filter((anchor) => anchor.kind !== "toolCall" && anchor.kind !== "span"),
      ],
      destinations: [
        ...references.destinations,
        ...finding.destinations.filter((destination) => destination.kind !== "toolCall" && destination.kind !== "span"),
      ],
    }
  })
}

const toolStatusFinding = ({
  call,
  generations,
  toolCalls,
  failedToolSpans,
  hasCompletion,
}: {
  readonly call: SessionToolCallFact
  readonly generations: readonly SessionGenerationFact[]
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly failedToolSpans: ReadonlySet<string>
  readonly hasCompletion: boolean
}): Extract<AssessmentFinding, { readonly kind: "toolFailure" }> & { readonly sameSubjectRecovered: boolean } => {
  const detail = call.statusMessage.trim() || call.errorType.trim()
  const references = toolSpanReferences(call)
  const lifecycle = toolFailureLifecycle({
    call,
    generations,
    toolCalls,
    failedToolSpans,
    hasCompletion,
  })

  return {
    evidenceKey: `span:${call.traceId}:${call.spanId}:tool-failure:${classifyToolError(detail)}`,
    label: `${call.toolName || "Tool call"} failed`,
    ...(detail ? { description: detail } : {}),
    source: "metric",
    metricId: "tools.call_failed",
    signalIds: [],
    scoreIds: [],
    occurrenceCount: 1,
    chronology: { occurredAt: call.endTime },
    anchors: references.anchors,
    destinations: references.destinations,
    independentHumanEvidence: false,
    kind: "toolFailure",
    ...lifecycle,
  }
}

const readToolStatusFindings = ({
  generations,
  toolCalls,
  deterministic,
  hasCompletion,
}: {
  readonly generations: readonly SessionGenerationFact[]
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly deterministic: readonly AssessmentFinding[]
  readonly hasCompletion: boolean
}): {
  readonly deterministic: AssessmentFinding[]
  readonly findings: AssessmentFinding[]
  readonly readers: AssessmentReaderFact[]
} => {
  const failedToolSpans = failedToolSpanIdentities(deterministic)

  const contentDetected = new Map<string, number[]>()
  for (const [index, finding] of deterministic.entries()) {
    if (finding.kind !== "toolFailure") continue
    const spanIdentities = finding.anchors.flatMap((anchor) =>
      anchor.kind === "span" ? [`span:${toolSpanIdentity(anchor)}`] : [],
    )
    for (const identity of new Set(spanIdentities)) {
      contentDetected.set(identity, [...(contentDetected.get(identity) ?? []), index])
    }
  }

  const reconciledDeterministic = deterministic.map((finding): AssessmentFinding => {
    if (finding.kind !== "toolFailure") return finding
    const call = failedToolCall(finding, toolCalls)
    if (!call) return finding
    return {
      ...finding,
      ...toolFailureLifecycle({ call, generations, toolCalls, failedToolSpans, hasCompletion }),
    }
  })
  const findings = toolCalls.flatMap((call): AssessmentFinding[] => {
    if (call.statusCode !== "error") return []
    const spanMatch = contentDetected.get(`span:${toolSpanIdentity(call)}`)?.shift()
    const statusFinding = toolStatusFinding({ call, generations, toolCalls, failedToolSpans, hasCompletion })
    if (spanMatch !== undefined) {
      const contentFinding = reconciledDeterministic[spanMatch]
      if (contentFinding?.kind === "toolFailure") {
        reconciledDeterministic[spanMatch] = {
          ...contentFinding,
          recovered: statusFinding.recovered,
          sameSubjectRecovered: statusFinding.sameSubjectRecovered,
          terminal: statusFinding.terminal,
        }
      }
      return []
    }
    return [statusFinding]
  })

  const statusless = toolCalls.filter((call) => call.statusCode === "unset").length

  return {
    deterministic: reconciledDeterministic,
    findings,
    readers: [
      {
        readerId: "tools.call_status",
        label: "Tool span status",
        scoreDimensions: ["reliability", "cost", "speed"],
        applicable: toolCalls.length > 0,
        findingCount: findings.length,
        readableCount: toolCalls.length - statusless,
        totalCount: toolCalls.length,
        ...(statusless > 0 ? { limitation: "missingTelemetry" as const } : {}),
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

const scoreObservationProbability = (
  score: Score,
  screeningDecisions: NormalizedSessionAssessmentInput["screeningDecisions"],
): number | undefined => {
  const flaggerSlug = score.sourceType === "annotation" ? score.metadata.flaggerSlug : undefined
  if (!flaggerSlug) return 1
  return screeningDecisions.find((decision) => decision.flaggerSlug === flaggerSlug)?.inclusionProbability
}

const readScoreFindings = (
  scores: readonly Score[],
  signals: readonly SignalWithLifecycle[],
  screeningDecisions: NormalizedSessionAssessmentInput["screeningDecisions"],
  evidenceAliases: readonly {
    readonly sourceEvidenceKey: string
    readonly targetEvidenceKey: string
    readonly messageIndex?: number
  }[] = [],
): AssessmentFinding[] => {
  const signalsById = new Map<string, SignalWithLifecycle>(signals.map((signal) => [signal.id, signal]))
  return scores.flatMap((score): AssessmentFinding[] => {
    if (score.draftedAt || score.errored) return []
    const signal = score.signalId ? signalsById.get(score.signalId) : undefined
    if (signal?.ignoredAt) return []
    const metadata = score.sourceType === "annotation" ? score.metadata : undefined
    const observationProbability = scoreObservationProbability(score, screeningDecisions)
    const aliasCandidates = metadata?.flaggerFindingKey
      ? evidenceAliases.filter(
          (alias) =>
            alias.sourceEvidenceKey === metadata.flaggerFindingKey &&
            (metadata.messageIndex === undefined || alias.messageIndex === metadata.messageIndex),
        )
      : []
    const evidenceKey =
      aliasCandidates.length === 1
        ? (aliasCandidates[0]?.targetEvidenceKey ?? `score:${score.id}`)
        : (metadata?.flaggerFindingKey ?? `score:${score.id}`)
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
      ...(observationProbability !== undefined && observationProbability > 0 ? { observationProbability } : {}),
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

const generationOutputHasToolCall = (generation: SessionGenerationFact): boolean =>
  generation.content?.outputMessages.some(
    (message) =>
      Array.isArray(message.parts) &&
      message.parts.some(
        (part) => typeof part === "object" && part !== null && "type" in part && part.type === "tool_call",
      ),
  ) ?? false

const isSuccessfulGeneration = (generation: SessionGenerationFact): boolean => {
  const endpoint = classifySpanEndpoint(generation)
  return (
    generation.statusCode !== "error" &&
    endpoint.providerError === null &&
    endpoint.finishReasons.every((reason) => reason.classification === "clean")
  )
}

const isSuccessfulToolRecoveryGeneration = (
  generation: SessionGenerationFact,
  toolCalls: readonly SessionToolCallFact[],
): boolean => {
  const endpoint = classifySpanEndpoint(generation)
  if (endpoint.finishReasons.length === 0 && !hasUsableAssistantCompletion(generation.content?.outputMessages ?? [])) {
    return false
  }
  const continuedIntoTool =
    endpoint.finishReasons.some((reason) => reason.classification === "clean" && reason.kind === "toolContinuation") ||
    toolCalls.some((call) => call.traceId === generation.traceId && call.parentSpanId === generation.spanId) ||
    generationOutputHasToolCall(generation)
  return !continuedIntoTool && isSuccessfulGeneration(generation)
}

const retrySpansThrough = ({
  generations,
  traceId,
  after,
  successfulSpanId,
}: {
  readonly generations: readonly SessionGenerationFact[]
  readonly traceId?: string
  readonly after: Date
  readonly successfulSpanId?: string
}) => {
  const candidates = generations
    .filter(
      (generation) =>
        (traceId === undefined || generation.traceId === traceId) &&
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
    : candidates.slice(0, successfulIndex + 1).map((generation) => ({
        traceId: generation.traceId,
        spanId: generation.spanId as string,
      }))
}

const retryToolSpansThrough = ({
  failed,
  toolCalls,
  failedToolSpans,
  normalizedToolName,
}: {
  readonly failed: SessionToolCallFact
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly failedToolSpans: ReadonlySet<string>
  readonly normalizedToolName?: string
}) => {
  const candidates = toolCalls
    .filter(
      (call) =>
        (call.traceId !== failed.traceId || call.spanId !== failed.spanId) &&
        (normalizedToolName === undefined || call.normalizedToolName === normalizedToolName) &&
        call.startTime.getTime() >= failed.endTime.getTime(),
    )
    .sort(
      (left, right) => left.startTime.getTime() - right.startTime.getTime() || left.spanId.localeCompare(right.spanId),
    )
  const successfulIndex = candidates.findIndex(
    (call) => call.statusCode === "ok" && !failedToolSpans.has(toolSpanIdentity(call)),
  )
  return successfulIndex < 0
    ? []
    : candidates.slice(0, successfulIndex + 1).map((call) => ({
        traceId: call.traceId,
        spanId: call.spanId as string,
      }))
}

const retryProgressSpansThrough = ({
  failed,
  generations,
  toolCalls,
  failedToolSpans,
}: {
  readonly failed: SessionToolCallFact
  readonly generations: readonly SessionGenerationFact[]
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly failedToolSpans: ReadonlySet<string>
}) => {
  const candidates = [
    ...toolCalls
      .filter(
        (call) =>
          (call.traceId !== failed.traceId || call.spanId !== failed.spanId) &&
          call.startTime.getTime() >= failed.endTime.getTime(),
      )
      .map((call) => ({
        traceId: call.traceId as string,
        spanId: call.spanId as string,
        startTime: call.startTime,
        endTime: call.endTime,
        successful: call.statusCode === "ok" && !failedToolSpans.has(toolSpanIdentity(call)),
      })),
    ...generations
      .filter(
        (generation) =>
          isLlmCompletionOperation(generation.operation) && generation.startTime.getTime() >= failed.endTime.getTime(),
      )
      .map((generation) => ({
        traceId: generation.traceId as string,
        spanId: generation.spanId as string,
        startTime: generation.startTime,
        endTime: generation.endTime,
        successful: isSuccessfulToolRecoveryGeneration(generation, toolCalls),
      })),
  ].sort(
    (left, right) =>
      left.endTime.getTime() - right.endTime.getTime() ||
      left.startTime.getTime() - right.startTime.getTime() ||
      left.traceId.localeCompare(right.traceId) ||
      left.spanId.localeCompare(right.spanId),
  )
  const successfulIndex = candidates.findIndex((candidate) => candidate.successful)
  return successfulIndex < 0
    ? []
    : candidates.slice(0, successfulIndex + 1).map(({ traceId, spanId }) => ({ traceId, spanId }))
}

const laterSameToolSucceeded = ({
  failed,
  toolCalls,
  failedToolSpans,
}: {
  readonly failed: SessionToolCallFact
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly failedToolSpans: ReadonlySet<string>
}): boolean =>
  failed.normalizedToolName !== "" &&
  retryToolSpansThrough({ failed, toolCalls, failedToolSpans, normalizedToolName: failed.normalizedToolName }).length >
    0

const successfulProgressAfter = ({
  failed,
  generations,
  toolCalls,
  failedToolSpans,
}: {
  readonly failed: SessionToolCallFact
  readonly generations: readonly SessionGenerationFact[]
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly failedToolSpans: ReadonlySet<string>
}): boolean => retryProgressSpansThrough({ failed, generations, toolCalls, failedToolSpans }).length > 0

const toolFailureLifecycle = ({
  call,
  generations,
  toolCalls,
  failedToolSpans,
  hasCompletion,
}: {
  readonly call: SessionToolCallFact
  readonly generations: readonly SessionGenerationFact[]
  readonly toolCalls: readonly SessionToolCallFact[]
  readonly failedToolSpans: ReadonlySet<string>
  readonly hasCompletion: boolean
}) => {
  const recovered = hasCompletion && successfulProgressAfter({ failed: call, generations, toolCalls, failedToolSpans })
  return {
    recovered,
    sameSubjectRecovered: laterSameToolSucceeded({ failed: call, toolCalls, failedToolSpans }),
    terminal: !recovered,
  }
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
  const retrySpans = retrySpansThrough({
    generations,
    traceId: anchor.traceId,
    after: failed.endTime,
    successfulSpanId: finding.successfulSpanId,
  })
  return retrySpans.length === 0
    ? []
    : [{ traceId: anchor.traceId, spanId: anchor.spanId, kind: finding.findingKind, retrySpans }]
}

const failedToolCall = (
  finding: Extract<AssessmentFinding, { readonly kind: "toolFailure" }>,
  toolCalls: readonly SessionToolCallFact[],
): SessionToolCallFact | undefined => {
  const anchor = finding.anchors.find((candidate) => candidate.kind === "span")
  if (anchor?.kind !== "span") return undefined
  return toolCalls.find((toolCall) => toolCall.traceId === anchor.traceId && toolCall.spanId === anchor.spanId)
}

const recoveredToolIncident = (
  finding: Extract<AssessmentFinding, { readonly kind: "toolFailure" }>,
  generations: readonly SessionGenerationFact[],
  toolCalls: readonly SessionToolCallFact[],
  failedToolSpans: ReadonlySet<string>,
): RecoveredIncident[] => {
  if (!finding.recovered || finding.terminal) return []
  const failed = failedToolCall(finding, toolCalls)
  if (!failed) return []
  const retrySpans = retryProgressSpansThrough({ failed, generations, toolCalls, failedToolSpans })
  return retrySpans.length === 0
    ? []
    : [
        {
          traceId: failed.traceId,
          spanId: failed.spanId,
          kind: "toolFailure",
          retrySpans,
        },
      ]
}

const recoveredIncidentsFrom = (
  findings: readonly AssessmentFinding[],
  generations: readonly SessionGenerationFact[],
  toolCalls: readonly SessionToolCallFact[],
): RecoveredIncident[] => {
  const failedToolSpans = failedToolSpanIdentities(findings)
  return findings.flatMap((finding): RecoveredIncident[] => {
    if (finding.kind === "providerError") return recoveredProviderIncident(finding, generations)
    if (finding.kind === "toolFailure") return recoveredToolIncident(finding, generations, toolCalls, failedToolSpans)
    return []
  })
}

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
    const hasCompletion = hasUsableAssistantCompletion(input.session.outputMessages)
    const deterministic = yield* readDeterministicFindings(input.session, input.spans)
    const deterministicFindings = resolveDeterministicToolReferences(
      deterministic.findings,
      input.toolCalls,
      input.session,
      input.generations,
    )
    const deterministicEvidenceAliases = deterministic.findings.flatMap((finding, index) => {
      const resolved = deterministicFindings[index]
      if (!resolved || resolved.evidenceKey === finding.evidenceKey) return []
      return [
        {
          sourceEvidenceKey: finding.evidenceKey,
          targetEvidenceKey: resolved.evidenceKey,
          ...(finding.chronology.messageIndex !== undefined ? { messageIndex: finding.chronology.messageIndex } : {}),
        },
      ]
    })
    const spanFindings = readSpanFindings(input.session, input.spans, deterministicFindings)
    const toolStatusFindings = readToolStatusFindings({
      generations: input.generations,
      toolCalls: input.toolCalls,
      deterministic: deterministicFindings,
      hasCompletion,
    })
    const findings = [
      ...(hasCompletion
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
      ...toolStatusFindings.deterministic,
      ...spanFindings.findings,
      ...toolStatusFindings.findings,
      ...readScoreFindings(input.scores, input.signals, input.screeningDecisions, deterministicEvidenceAliases),
      ...readMomentFindings(input.moments),
    ]

    const surfaces = toolDefinitionSurfaces({ generations: input.generations, toolCalls: input.toolCalls })
    const costEvidence = readSessionCostEvidence({
      generations: input.generations,
      toolCalls: input.toolCalls,
      memoryEvents: input.memoryEvents,
      countTokens,
      completed: hasCompletion,
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
      readers: [
        ...deterministic.readers,
        ...spanFindings.readers,
        ...toolStatusFindings.readers,
        ...costEvidence.readers,
      ],
      screeningDecisions: input.screeningDecisions,
      scoringEligibleSignalIds: [...scoringEligibleSignalIds(input.signals)],
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
