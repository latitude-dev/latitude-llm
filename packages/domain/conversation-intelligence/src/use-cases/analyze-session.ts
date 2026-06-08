import { AI } from "@domain/ai"
import { OrganizationId, ProjectId, SessionId, TaxonomyClusterId, TraceId } from "@domain/shared"
import { type SessionDetail, SessionRepository } from "@domain/spans"
import {
  assignObservationToClusterUseCase,
  normalizeTaxonomyEmbedding,
  replaceObservationInClusterUseCase,
  routeToDeepestClusterUseCase,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  type TaxonomyMomentObservation,
  TaxonomyObservationAssignmentMethod,
  TaxonomyObservationRepository,
  TaxonomyProjectionMethod,
} from "@domain/taxonomy"
import { hash } from "@repo/utils"
import { Effect } from "effect"
import { z } from "zod"
import { embedAnchorText, MOMENT_LABEL_ANCHORS } from "../anchors.ts"
import {
  CONVERSATION_INTELLIGENCE_DETECTOR_VERSION,
  CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
  CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
  CONVERSATION_INTELLIGENCE_LLM_MAX_DOCUMENT_CHARS,
  CONVERSATION_INTELLIGENCE_MIN_CONTENT_LENGTH,
  CONVERSATION_INTELLIGENCE_RETENTION_DAYS,
  MOMENT_KINDS,
} from "../constants.ts"
import type { SessionAnalysis } from "../entities/session-analysis.ts"
import type { MomentLabelKind as MomentKind, SessionMomentLabel } from "../entities/session-moment-label.ts"
import type { SessionSemanticMoment } from "../entities/session-semantic-moment.ts"
import {
  documentFromMessages,
  type NormalizedMessage,
  normalizeMessages,
  stripToolTelemetry,
} from "../normalization.ts"
import { SessionAnalysisRepository } from "../ports/session-analysis-repository.ts"
import { SessionMomentLabelRepository } from "../ports/session-moment-label-repository.ts"
import { SessionSemanticMomentRepository } from "../ports/session-semantic-moment-repository.ts"
import { type SemanticSegmentationTurn, segmentSemanticMoments } from "../semantic-segmentation.ts"

export interface AnalyzeSessionInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly triggeringTraceId: string
  readonly triggeringStartTime: string
  readonly retentionDays?: number
}

export type AnalyzeSessionResult =
  | { readonly action: "skipped"; readonly reason: "session-not-found" | "hash-current" }
  | {
      readonly action: "recorded"
      readonly status: SessionAnalysis["analysisStatus"]
      readonly momentCount: number
    }

const extractionMomentSchema = z.object({
  kind: z.string(),
  firstMessageIndex: z.number().int().nonnegative(),
  lastMessageIndex: z.number().int().nonnegative(),
  actor: z.enum(["user", "assistant", "tool", "system", "unknown"]),
  summary: z.string(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
})

const TAXONOMY_DIRECT_PROJECTION_MAX_LENGTH = CONVERSATION_INTELLIGENCE_LLM_MAX_DOCUMENT_CHARS

const sessionConversationMessages = (session: SessionDetail): readonly unknown[] => {
  const systemMessage =
    Array.isArray(session.systemInstructions) && session.systemInstructions.length > 0
      ? [{ role: "system", parts: session.systemInstructions }]
      : []
  return [...systemMessage, ...session.lastInputMessages, ...session.outputMessages]
}

const middleTruncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value
  const head = Math.floor((maxLength - 15) / 2)
  const tail = maxLength - 15 - head
  return `${value.slice(0, head)}\n[...truncated...]\n${value.slice(value.length - tail)}`
}

const buildSessionConversationProjectionText = (messages: readonly NormalizedMessage[]): string =>
  middleTruncate(
    messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => `${message.role}: ${stripToolTelemetry(message.text)}`)
      .join("\n\n"),
    TAXONOMY_DIRECT_PROJECTION_MAX_LENGTH,
  )

// Tool-role turns (tool results) are excluded from the semantic pipeline:
// segmentation centroids, label scoring, and topic projections all operate on
// the user/assistant exchange only.
const embedTurns = (messages: readonly NormalizedMessage[]) =>
  Effect.gen(function* () {
    const ai = yield* AI
    return yield* Effect.forEach(
      messages.filter((message) => message.role !== "tool"),
      (message) =>
        ai
          .embed({
            text: `${message.role}: ${message.text}`,
            model: CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
            dimensions: CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
            inputType: "document",
          })
          .pipe(
            Effect.map(
              (result): SemanticSegmentationTurn => ({
                index: message.index,
                role: message.role,
                content: message.text,
                embedding: result.embedding,
              }),
            ),
          ),
    )
  })

const isConversation = (messages: readonly NormalizedMessage[]): boolean => {
  const hasUser = messages.some((message) => message.role === "user")
  const hasAssistant = messages.some((message) => message.role === "assistant")
  return hasUser && hasAssistant
}

const isAllowedMoment = (kind: string): kind is MomentKind => (MOMENT_KINDS as readonly string[]).includes(kind)

const confidenceFloor = (kind: MomentKind): number => {
  switch (kind) {
    case "user_frustration":
    case "hesitation":
      return 0.8
    default:
      return 0.65
  }
}

const evidenceMatches = (evidence: string, messages: readonly NormalizedMessage[]): boolean => {
  const normalizedEvidence = evidence.trim().toLowerCase()
  if (normalizedEvidence.length === 0) return false
  return messages.some((message) => message.text.toLowerCase().includes(normalizedEvidence.slice(0, 80)))
}

const makeMomentId = (input: {
  readonly detectorVersion: string
  readonly analysisHash: string
  readonly kind: MomentKind
  readonly firstMessageIndex: number
  readonly lastMessageIndex: number
  readonly evidence: string
}) =>
  hash(
    `${input.detectorVersion}\0${input.analysisHash}\0${input.kind}\0${input.firstMessageIndex}\0${input.lastMessageIndex}\0${input.evidence}`,
  )

const toDetectedMoment = (input: {
  readonly raw: z.infer<typeof extractionMomentSchema>
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  readonly analysisHash: string
  readonly indexedAt: Date
  readonly retentionDays: number
  readonly messages: readonly NormalizedMessage[]
}) =>
  Effect.gen(function* () {
    if (!isAllowedMoment(input.raw.kind)) return null
    const kind = input.raw.kind
    if (input.raw.confidence < confidenceFloor(kind)) return null
    if (input.raw.lastMessageIndex < input.raw.firstMessageIndex) return null
    const indexes = new Set(input.messages.map((message) => message.index))
    if (!indexes.has(input.raw.firstMessageIndex) || !indexes.has(input.raw.lastMessageIndex)) return null
    if (!evidenceMatches(input.raw.evidence, input.messages)) return null
    const momentId = yield* makeMomentId({
      detectorVersion: CONVERSATION_INTELLIGENCE_DETECTOR_VERSION,
      analysisHash: input.analysisHash,
      kind,
      firstMessageIndex: input.raw.firstMessageIndex,
      lastMessageIndex: input.raw.lastMessageIndex,
      evidence: input.raw.evidence,
    })
    return {
      organizationId: input.organizationId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      momentId,
      kind,
      firstMessageIndex: input.raw.firstMessageIndex,
      lastMessageIndex: input.raw.lastMessageIndex,
      actor: input.raw.actor,
      summary: input.raw.summary,
      evidence: input.raw.evidence,
      confidence: input.raw.confidence,
      analysisHash: input.analysisHash,
      retentionDays: input.retentionDays,
      indexedAt: input.indexedAt,
    } satisfies DetectedMoment
  })

interface DetectedMoment {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly sessionId: SessionId
  readonly momentId: string
  readonly kind: MomentKind
  readonly firstMessageIndex: number
  readonly lastMessageIndex: number
  readonly actor: SessionMomentLabel["actor"]
  readonly summary: string
  readonly evidence: string
  readonly confidence: number
  readonly analysisHash: string
  readonly retentionDays: number
  readonly indexedAt: Date
}

const vectorMagnitude = (vector: readonly number[]): number =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))

const cosineSimilarity = (a: readonly number[], b: readonly number[]): number => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  const denominator = vectorMagnitude(a) * vectorMagnitude(b)
  if (denominator === 0) return 0
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0) / denominator
}

const detectEmbeddingAnchorMoments = (input: {
  readonly messages: readonly NormalizedMessage[]
  readonly turns: readonly SemanticSegmentationTurn[]
  readonly segments: ReturnType<typeof segmentSemanticMoments>
}): Effect.Effect<readonly z.infer<typeof extractionMomentSchema>[], unknown, AI> =>
  Effect.gen(function* () {
    const embeddedAnchors = yield* Effect.forEach(MOMENT_LABEL_ANCHORS, (config) =>
      Effect.gen(function* () {
        const positive = yield* Effect.forEach(config.positiveAnchors, embedAnchorText)
        const contrast = yield* Effect.forEach(config.contrastAnchors, embedAnchorText)
        return { config, positive, contrast }
      }),
    )
    const messagesByIndex = new Map(input.messages.map((message) => [message.index, message] as const))
    const turnsByIndex = new Map(input.turns.map((turn) => [turn.index, turn] as const))
    const labels: z.infer<typeof extractionMomentSchema>[] = []

    for (const segment of input.segments) {
      for (const { config, positive, contrast } of embeddedAnchors) {
        const sourceTurns = segment.turnIndexes.flatMap((index) => {
          const turn = turnsByIndex.get(index)
          return turn && config.roles.includes(turn.role) ? [turn] : []
        })
        if (sourceTurns.length === 0) continue
        // Score each turn individually instead of the segment centroid: with
        // multi-turn moments the centroid dilutes localized events below the
        // anchor threshold (QA: 184 labels across 500 support sessions, with
        // resolution detected 3 times). The label anchors to the best turn.
        let best: {
          readonly turn: SemanticSegmentationTurn
          readonly positiveScore: number
          readonly margin: number
        } | null = null
        for (const turn of sourceTurns) {
          const positiveScore = Math.max(...positive.map((anchor) => cosineSimilarity(turn.embedding, anchor)), 0)
          const contrastScore = Math.max(...contrast.map((anchor) => cosineSimilarity(turn.embedding, anchor)), 0)
          const margin = positiveScore - contrastScore
          if (positiveScore < config.threshold || margin < config.margin) continue
          if (!best || positiveScore + margin > best.positiveScore + best.margin) {
            best = { turn, positiveScore, margin }
          }
        }
        if (!best) continue
        const evidence = (messagesByIndex.get(best.turn.index)?.text ?? best.turn.content).slice(0, 240)
        labels.push({
          kind: config.kind,
          firstMessageIndex: best.turn.index,
          lastMessageIndex: best.turn.index,
          actor: config.actor,
          summary: config.summary,
          evidence,
          confidence: Math.max(0, Math.min(1, 0.5 + best.margin / 2 + best.positiveScore / 2)),
        })
      }
    }
    return labels
  })

export const analyzeSessionUseCase = (input: AnalyzeSessionInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("conversationIntelligence.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("conversationIntelligence.sessionId", input.sessionId)
    const organizationId = OrganizationId(input.organizationId)
    const projectId = ProjectId(input.projectId)
    const sessionId = SessionId(input.sessionId)
    const sessions = yield* SessionRepository
    const analyses = yield* SessionAnalysisRepository
    const semanticMoments = yield* SessionSemanticMomentRepository
    const momentLabels = yield* SessionMomentLabelRepository
    const taxonomyObservations = yield* TaxonomyObservationRepository
    const session = yield* sessions
      .findBySessionId({ organizationId, projectId, sessionId })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (session === null) {
      const indexedAt = new Date()
      const startTime = new Date(input.triggeringStartTime)
      yield* analyses.upsert({
        organizationId,
        projectId,
        sessionId,
        startTime,
        endTime: startTime,
        traceIds: input.triggeringTraceId.length === 32 ? [TraceId(input.triggeringTraceId)] : [],
        analysisHash: "0".repeat(64),
        analysisStatus: "failed",
        statusReason: "Session not found",
        retentionDays: input.retentionDays ?? CONVERSATION_INTELLIGENCE_RETENTION_DAYS,
        indexedAt,
      })
      return { action: "recorded", status: "failed", momentCount: 0 } satisfies AnalyzeSessionResult
    }

    const traceIds = session.traceIds.filter((traceId) => traceId.length === 32).map(TraceId)
    const rawMessages = sessionConversationMessages(session)
    const normalizedMessages = normalizeMessages(rawMessages)
    const document = documentFromMessages(normalizedMessages)
    const analysisHash = yield* hash(`${CONVERSATION_INTELLIGENCE_DETECTOR_VERSION}\0${session.sessionId}\0${document}`)
    const latest = yield* analyses.findLatest({ organizationId, projectId, sessionId })
    if (latest?.analysisHash === analysisHash && latest.analysisStatus !== "failed") {
      return { action: "skipped", reason: "hash-current" } satisfies AnalyzeSessionResult
    }

    const indexedAt = new Date()
    const retentionDays = input.retentionDays ?? CONVERSATION_INTELLIGENCE_RETENTION_DAYS
    const canAnalyzeConversation = isConversation(normalizedMessages)

    const baseAnalysis = {
      organizationId,
      projectId,
      sessionId,
      startTime: session.startTime,
      endTime: session.endTime,
      traceIds,
      analysisHash,
      statusReason: "",
      retentionDays,
      indexedAt,
    } satisfies Omit<SessionAnalysis, "analysisStatus">

    if (normalizedMessages.length === 0 || document.length === 0) {
      yield* analyses.upsert({ ...baseAnalysis, analysisStatus: "skipped_empty", statusReason: "No semantic messages" })
      return { action: "recorded", status: "skipped_empty", momentCount: 0 } satisfies AnalyzeSessionResult
    }
    if (document.length < CONVERSATION_INTELLIGENCE_MIN_CONTENT_LENGTH) {
      yield* analyses.upsert({
        ...baseAnalysis,
        analysisStatus: "skipped_too_short",
        statusReason: "Below content floor",
      })
      return {
        action: "recorded",
        status: "skipped_too_short",
        momentCount: 0,
      } satisfies AnalyzeSessionResult
    }
    if (!canAnalyzeConversation) {
      yield* analyses.upsert({
        ...baseAnalysis,
        analysisStatus: "skipped_non_conversation",
        statusReason: "Session does not contain both user and assistant messages",
      })
      return {
        action: "recorded",
        status: "skipped_non_conversation",
        momentCount: 0,
      } satisfies AnalyzeSessionResult
    }

    const embeddedTurns = yield* embedTurns(normalizedMessages)
    const semanticSegments = segmentSemanticMoments({
      turns: embeddedTurns,
    })

    const anchorDetected = yield* detectEmbeddingAnchorMoments({
      messages: normalizedMessages,
      turns: embeddedTurns,
      segments: semanticSegments,
    })
    const rawMoments = anchorDetected
    const validatedMoments = (yield* Effect.forEach(rawMoments, (raw) =>
      toDetectedMoment({
        raw,
        organizationId,
        projectId,
        sessionId,
        analysisHash,
        indexedAt,
        retentionDays,
        messages: normalizedMessages,
      }),
    )).flatMap((moment): DetectedMoment[] => (moment === null ? [] : [moment as DetectedMoment]))

    const semanticMomentRows = yield* Effect.forEach(semanticSegments, (segment) =>
      Effect.gen(function* () {
        const momentId = yield* hash(`${analysisHash}\0semantic\0${segment.firstTurnIndex}\0${segment.lastTurnIndex}`)
        return {
          organizationId,
          projectId,
          sessionId,
          analysisHash,
          momentId,
          // The schema requires a 32-char trace id; when the session has no
          // trace details and the triggering id is non-standard, a stable
          // 32-hex surrogate keeps the analysis from failing permanently.
          traceId:
            traceIds[0] ??
            (input.triggeringTraceId.length === 32
              ? TraceId(input.triggeringTraceId)
              : TraceId((yield* hash(input.triggeringTraceId)).slice(0, 32))),
          startTime: session.startTime,
          endTime: session.endTime,
          firstMessageIndex: segment.firstTurnIndex,
          lastMessageIndex: segment.lastTurnIndex,
          // The segment's own reason is kept — overwriting the last segment
          // with "session_end" destroyed genuine max_length/semantic_drift
          // boundaries (and labeled single-moment sessions as "end").
          boundaryReason: segment.boundaryReason,
          embedding: [...segment.centroidEmbedding],
          coherenceScore: segment.coherenceScore,
          retentionDays,
          indexedAt,
        } satisfies SessionSemanticMoment
      }),
    )
    const labelRows = yield* Effect.forEach(validatedMoments, (moment) =>
      Effect.gen(function* () {
        // Containment first; otherwise the nearest segment by index distance
        // (never blindly the first moment of the session).
        const semanticMoment =
          semanticMomentRows.find(
            (segment) =>
              moment.firstMessageIndex >= segment.firstMessageIndex &&
              moment.lastMessageIndex <= segment.lastMessageIndex,
          ) ??
          [...semanticMomentRows].sort(
            (a, b) =>
              Math.min(
                Math.abs(moment.firstMessageIndex - a.lastMessageIndex),
                Math.abs(a.firstMessageIndex - moment.lastMessageIndex),
              ) -
              Math.min(
                Math.abs(moment.firstMessageIndex - b.lastMessageIndex),
                Math.abs(b.firstMessageIndex - moment.lastMessageIndex),
              ),
          )[0]
        const labelId = yield* hash(`${moment.analysisHash}\0label\0${moment.momentId}`)
        return semanticMoment === undefined
          ? null
          : ({
              organizationId,
              projectId,
              sessionId,
              analysisHash,
              labelId,
              momentId: semanticMoment.momentId,
              kind: moment.kind,
              actor: moment.actor,
              firstMessageIndex: moment.firstMessageIndex,
              lastMessageIndex: moment.lastMessageIndex,
              summary: moment.summary,
              evidence: moment.evidence,
              confidence: moment.confidence,
              retentionDays,
              indexedAt,
            } satisfies SessionMomentLabel)
      }),
    ).pipe(Effect.map((labels) => labels.filter((label): label is SessionMomentLabel => label !== null)))

    const taxonomyObservationRows = yield* Effect.gen(function* () {
      const projectionText = buildSessionConversationProjectionText(normalizedMessages)
      if (projectionText.length === 0) return [] as TaxonomyMomentObservation[]
      const ai = yield* AI
      const projectionEmbedding = yield* ai.embed({
        text: projectionText,
        model: CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
        dimensions: CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
        inputType: "document",
      })
      const projectionVector = normalizeTaxonomyEmbedding(projectionEmbedding.embedding)
      if (projectionVector.length === 0) return [] as TaxonomyMomentObservation[]

      const dimension = "topic" as const
      const sessionMomentId = (yield* hash(`${sessionId}\0session_topic`)).slice(0, 24)
      const projectionHash = yield* hash(
        `${analysisHash}\0${sessionId}\0${dimension}\0${TaxonomyProjectionMethod.MomentTextEmbedding}\0${projectionText}`,
      )
      const observationId = (yield* hash(
        `${organizationId}\0${projectId}\0${sessionId}\0${dimension}\0${TaxonomyProjectionMethod.MomentTextEmbedding}\0observation`,
      )).slice(0, 24)
      const decision = yield* routeToDeepestClusterUseCase({
        projectId,
        dimension,
        queryVector: projectionVector,
      })

      return [
        {
          organizationId,
          projectId,
          observationId,
          sessionId,
          analysisHash,
          momentId: sessionMomentId,
          projectionMethod: TaxonomyProjectionMethod.MomentTextEmbedding,
          projectionHash,
          projectionMetadata: {
            projectionKind: "session_conversation",
            summary: projectionText,
          },
          embedding: [...projectionVector],
          assignedClusterId: decision.clusterId === null ? null : TaxonomyClusterId(decision.clusterId),
          assignmentConfidence: decision.confidence,
          assignmentMethod:
            decision.method === "centroid_online"
              ? TaxonomyObservationAssignmentMethod.CentroidOnline
              : TaxonomyObservationAssignmentMethod.Noise,
          reassignmentRunId: null,
          startTime: session.startTime,
          endTime: session.endTime,
          retentionDays: TAXONOMY_OBSERVATION_RETENTION_DAYS,
          indexedAt,
        } satisfies TaxonomyMomentObservation,
      ]
    })

    // Centroid increments are not idempotent, but the activity retries are:
    // the observation rows act as applied-markers. They are written FIRST, a
    // retry skips the increment for any id that already existed, and a crash
    // between the two at worst loses one increment (gardening self-corrects)
    // instead of double-counting it.
    const previousObservations =
      taxonomyObservationRows.length === 0
        ? []
        : yield* taxonomyObservations.listBySession({ organizationId, projectId, sessionId })
    const previousObservationById = new Map(
      previousObservations.map((observation) => [observation.observationId, observation] as const),
    )
    yield* taxonomyObservations.upsertMany(taxonomyObservationRows)
    yield* Effect.forEach(taxonomyObservationRows, (row) => {
      if (row.assignmentMethod !== TaxonomyObservationAssignmentMethod.CentroidOnline) return Effect.void
      if (row.assignedClusterId === null) return Effect.void

      const previous = previousObservationById.get(row.observationId)
      const isIdenticalRetry =
        previous?.assignmentMethod === TaxonomyObservationAssignmentMethod.CentroidOnline &&
        previous.assignedClusterId === row.assignedClusterId &&
        previous.analysisHash === row.analysisHash &&
        previous.projectionHash === row.projectionHash
      if (isIdenticalRetry) return Effect.void

      if (
        previous?.assignmentMethod === TaxonomyObservationAssignmentMethod.CentroidOnline &&
        previous.assignedClusterId === row.assignedClusterId
      ) {
        return replaceObservationInClusterUseCase({
          organizationId,
          projectId,
          clusterId: row.assignedClusterId,
          previousEmbedding: previous.embedding,
          previousObservedAt: previous.startTime,
          embedding: row.embedding,
          observedAt: row.startTime,
          assignedAt: indexedAt,
        }).pipe(Effect.map(() => undefined))
      }

      return assignObservationToClusterUseCase({
        organizationId,
        projectId,
        clusterId: row.assignedClusterId,
        embedding: row.embedding,
        observedAt: row.startTime,
        assignedAt: indexedAt,
      }).pipe(Effect.map(() => undefined))
    })

    const analysis: SessionAnalysis = {
      ...baseAnalysis,
      analysisStatus: "analyzed",
    }
    yield* analyses.upsert(analysis)
    yield* semanticMoments.upsertMany(semanticMomentRows)
    yield* momentLabels.upsertMany(labelRows)
    return {
      action: "recorded",
      status: "analyzed",
      momentCount: validatedMoments.length,
    } satisfies AnalyzeSessionResult
  }).pipe(
    Effect.catch((error: unknown) =>
      Effect.gen(function* () {
        const analyses = yield* SessionAnalysisRepository
        const organizationId = OrganizationId(input.organizationId)
        const projectId = ProjectId(input.projectId)
        const sessionId = SessionId(input.sessionId)
        const indexedAt = new Date()
        const startTime = new Date(input.triggeringStartTime)
        yield* analyses.upsert({
          organizationId,
          projectId,
          sessionId,
          startTime,
          endTime: startTime,
          traceIds: input.triggeringTraceId.length === 32 ? [TraceId(input.triggeringTraceId)] : [],
          analysisHash: "0".repeat(64),
          analysisStatus: "failed",
          statusReason: error instanceof Error ? error.message : "Session analysis failed",
          retentionDays: input.retentionDays ?? CONVERSATION_INTELLIGENCE_RETENTION_DAYS,
          indexedAt,
        })
        return { action: "recorded", status: "failed", momentCount: 0 } satisfies AnalyzeSessionResult
      }),
    ),
    Effect.withSpan("conversationIntelligence.analyzeSession"),
  )
