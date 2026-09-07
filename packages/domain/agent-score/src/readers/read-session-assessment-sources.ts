import type { SessionMomentLabel, SessionSemanticMoment } from "@domain/conversation-intelligence"
import {
  buildFlaggerSessionContext,
  emptyResponseStrategy,
  type FlaggerFinding,
  type FlaggerStrategy,
  lowCacheHitRateStrategy,
  outputSchemaValidationStrategy,
  readDeterministicFlaggerFindings,
  toolCallErrorsStrategy,
  trashingStrategy,
} from "@domain/flaggers"
import type { Score } from "@domain/scores"
import type { ScoreDimension } from "@domain/shared"
import type { SignalWithLifecycle } from "@domain/signals"
import { hasUsableAssistantCompletion, resolveSessionSpanEndpoints, type SessionDetail, type Span } from "@domain/spans"
import { Effect } from "effect"
import type { SessionEvidenceAnchor, SessionEvidenceDestination } from "../entities/session-assessment.ts"
import type {
  AssessmentFinding,
  AssessmentReaderFact,
  NormalizedSessionAssessmentInput,
} from "../entities/session-assessment-input.ts"
import type { SessionMomentFacts } from "../ports/session-assessment-sources.ts"

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

const findingBase = (finding: FlaggerFinding, traceId: string) => {
  const references =
    "messageIndex" in finding
      ? messageReferences(finding as MessageFlaggerFinding, traceId)
      : { chronology: {}, anchors: [], destinations: [] }
  return {
    evidenceKey: finding.findingKey,
    label: finding.feedback,
    description: finding.feedback,
    source: "metric" as const,
    signalIds: [],
    scoreIds: [],
    occurrenceCount: "occurrenceCount" in finding ? finding.occurrenceCount : 1,
    ...references,
    independentHumanEvidence: false,
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
      if (finding.findingKind === "error") {
        const anchors = finding.toolCallId
          ? [
              ...base.anchors,
              {
                kind: "toolCall" as const,
                traceId,
                toolCallId: finding.toolCallId,
                toolName: finding.toolName,
                messageIndex: finding.messageIndex,
              },
            ]
          : base.anchors
        const destinations = finding.toolCallId
          ? [...base.destinations, { kind: "toolCall" as const, traceId, toolCallId: finding.toolCallId }]
          : base.destinations
        return {
          ...base,
          metricId: "tools.call_failed",
          kind: "toolFailure",
          recovered: finding.recovered ?? hasCompletion,
          ...(finding.sameSubjectRecovered !== undefined ? { sameSubjectRecovered: finding.sameSubjectRecovered } : {}),
          terminal: finding.terminal ?? !hasCompletion,
          anchors,
          destinations,
        }
      }
      return {
        ...base,
        metricId: "tools.structural_defect",
        kind: "toolStructuralDefect",
        findingKind: finding.findingKind,
        terminal: !hasCompletion,
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
      label: signal?.name ?? metadata?.flaggerSlug ?? "Score",
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

    if (metadata?.flaggerSlug === "task-success") {
      return [
        {
          ...base,
          metricId: "sessions.task_success",
          kind: "taskOutcome",
          verdict: score.passed ? "success" : "failure",
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
          ...(metadata?.flaggerSlug ? { findingKind: metadata.flaggerSlug } : {}),
        },
      ]
    }
    return [{ ...base, kind: "standaloneScore", negative: !score.passed }]
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

export interface ReadSessionAssessmentSourcesInput {
  readonly session: SessionDetail
  readonly spans: readonly Span[]
  readonly scores: readonly Score[]
  readonly signals: readonly SignalWithLifecycle[]
  readonly moments: SessionMomentFacts
  readonly screeningDecisions: NormalizedSessionAssessmentInput["screeningDecisions"]
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

    return {
      sessionId: input.session.sessionId,
      observedMicrocents: input.session.costTotalMicrocents,
      observedDurationNs: input.session.durationNs,
      findings,
      readers: [...deterministic.readers, ...spanFindings.readers],
      screeningDecisions: input.screeningDecisions,
    } satisfies NormalizedSessionAssessmentInput
  })
