import { AI } from "@domain/ai"
import { OrganizationId, ProjectId, SessionId, TaxonomyClusterId, TraceId } from "@domain/shared"
import { SessionRepository, TraceRepository } from "@domain/spans"
import {
  type AnchorCalibration,
  assignObservationToClusterUseCase,
  loadClusteringCalibration,
  loadConversationCalibration,
  routeToDeepestClusterUseCase,
  type TaxonomyMomentObservation,
  TaxonomyObservationAssignmentMethod,
  TaxonomyObservationRepository,
  TaxonomyProjectionMethod,
} from "@domain/taxonomy"
import { hash } from "@repo/utils"
import { Effect } from "effect"
import { z } from "zod"
import {
  embedAnchorText,
  MOMENT_LABEL_ANCHORS,
  RITUAL_CONTRAST_ANCHORS,
  RITUAL_POSITIVE_ANCHORS,
  RITUAL_SUPPRESSION_MARGIN,
  RITUAL_SUPPRESSION_THRESHOLD,
} from "../anchors.ts"
import {
  CONVERSATION_INTELLIGENCE_DETECTOR_VERSION,
  CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
  CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
  CONVERSATION_INTELLIGENCE_MIN_CONTENT_LENGTH,
  CONVERSATION_INTELLIGENCE_RETENTION_DAYS,
  CONVERSATION_MOMENT_SEGMENTATION_VERSION,
  MOMENT_KINDS,
} from "../constants.ts"
import type { ConversationMomentLabel, MomentLabelKind as MomentKind } from "../entities/moment-label.ts"
import type { ConversationSemanticMoment } from "../entities/semantic-moment.ts"
import type { AnalysisLens, ConversationSessionAnalysis, InteractionKind } from "../entities/session-analysis.ts"
import {
  documentFromMessages,
  type NormalizedMessage,
  normalizeMessages,
  stripToolTelemetry,
} from "../normalization.ts"
import { ConversationMomentLabelRepository } from "../ports/moment-label-repository.ts"
import { ConversationSemanticMomentRepository } from "../ports/semantic-moment-repository.ts"
import { ConversationSessionAnalysisRepository } from "../ports/session-analysis-repository.ts"
import { type SemanticSegmentationTurn, segmentSemanticMoments } from "../semantic-segmentation.ts"

export interface AnalyzeSessionConversationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly triggeringTraceId: string
  readonly triggeringStartTime: string
  readonly retentionDays?: number
}

export type AnalyzeSessionConversationResult =
  | { readonly action: "skipped"; readonly reason: "session-not-found" | "hash-current" }
  | {
      readonly action: "recorded"
      readonly status: ConversationSessionAnalysis["analysisStatus"]
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

const TAXONOMY_DIRECT_PROJECTION_MAX_LENGTH = 2_000

const middleTruncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value
  const head = Math.floor((maxLength - 15) / 2)
  const tail = maxLength - 15 - head
  return `${value.slice(0, head)}\n[...truncated...]\n${value.slice(value.length - tail)}`
}

/**
 * Topic projection: the moment's full user+assistant exchange, tool telemetry
 * stripped. Embedding the whole exchange captures what the moment is about —
 * the unit the topic taxonomy clusters on.
 */
const momentProjectionText = (input: {
  readonly turns: readonly SemanticSegmentationTurn[]
  readonly turnIndexes: readonly number[]
}): string | null => {
  const indexes = new Set(input.turnIndexes)
  const text = input.turns
    .filter((turn) => indexes.has(turn.index) && (turn.role === "user" || turn.role === "assistant"))
    .flatMap((turn) => {
      const content = stripToolTelemetry(turn.content)
      return content.length > 0 ? [`${turn.role}: ${content}`] : []
    })
    .join("\n\n")
    .trim()
  return text.length === 0 ? null : middleTruncate(text, TAXONOMY_DIRECT_PROJECTION_MAX_LENGTH)
}

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

const classifyInteraction = (
  messages: readonly NormalizedMessage[],
): {
  readonly interactionKind: InteractionKind
  readonly analysisLens: AnalysisLens
} => {
  const hasUser = messages.some((message) => message.role === "user")
  const hasAssistant = messages.some((message) => message.role === "assistant")
  if (hasUser && hasAssistant) return { interactionKind: "user_conversation", analysisLens: "conversation" }
  return { interactionKind: "unknown", analysisLens: "telemetry_only" }
}

const isAllowedMoment = (kind: string, lens: AnalysisLens): kind is MomentKind =>
  lens === "conversation" && (MOMENT_KINDS as readonly string[]).includes(kind)

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
  readonly lens: AnalysisLens
  readonly messages: readonly NormalizedMessage[]
}) =>
  Effect.gen(function* () {
    if (!isAllowedMoment(input.raw.kind, input.lens)) return null
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
      detectorVersion: String(CONVERSATION_INTELLIGENCE_DETECTOR_VERSION),
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
  readonly actor: ConversationMomentLabel["actor"]
  readonly summary: string
  readonly evidence: string
  readonly confidence: number
  readonly detectorVersion: string
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

const isRitualProjection = (
  embedding: readonly number[],
  anchors: { readonly positive: readonly (readonly number[])[]; readonly contrast: readonly (readonly number[])[] },
  gate?: AnchorCalibration | null,
): boolean => {
  const threshold = gate?.threshold ?? RITUAL_SUPPRESSION_THRESHOLD
  const margin = gate?.margin ?? RITUAL_SUPPRESSION_MARGIN
  const ritualScore = Math.max(...anchors.positive.map((anchor) => cosineSimilarity(embedding, anchor)), 0)
  const substantiveScore = Math.max(...anchors.contrast.map((anchor) => cosineSimilarity(embedding, anchor)), 0)
  return ritualScore >= threshold && ritualScore - substantiveScore >= margin
}

const detectEmbeddingAnchorMoments = (input: {
  readonly messages: readonly NormalizedMessage[]
  readonly turns: readonly SemanticSegmentationTurn[]
  readonly segments: ReturnType<typeof segmentSemanticMoments>
  readonly labelGates?: Readonly<Record<string, AnchorCalibration>> | null
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
        const gate = input.labelGates?.[config.kind]
        const gateThreshold = gate?.threshold ?? config.threshold
        const gateMargin = gate?.margin ?? config.margin
        let best: {
          readonly turn: SemanticSegmentationTurn
          readonly positiveScore: number
          readonly margin: number
        } | null = null
        for (const turn of sourceTurns) {
          const positiveScore = Math.max(...positive.map((anchor) => cosineSimilarity(turn.embedding, anchor)), 0)
          const contrastScore = Math.max(...contrast.map((anchor) => cosineSimilarity(turn.embedding, anchor)), 0)
          const margin = positiveScore - contrastScore
          if (positiveScore < gateThreshold || margin < gateMargin) continue
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

export const analyzeSessionConversationUseCase = (input: AnalyzeSessionConversationInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("conversationIntelligence.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("conversationIntelligence.sessionId", input.sessionId)
    const organizationId = OrganizationId(input.organizationId)
    const projectId = ProjectId(input.projectId)
    const sessionId = SessionId(input.sessionId)
    const sessions = yield* SessionRepository
    const traces = yield* TraceRepository
    const analyses = yield* ConversationSessionAnalysisRepository
    const semanticMoments = yield* ConversationSemanticMomentRepository
    const momentLabels = yield* ConversationMomentLabelRepository
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
        interactionKind: "unknown",
        analysisLens: "telemetry_only",
        analysisStatus: "failed",
        statusReason: "Session not found",
        detectorVersion: String(CONVERSATION_INTELLIGENCE_DETECTOR_VERSION),
        retentionDays: input.retentionDays ?? CONVERSATION_INTELLIGENCE_RETENTION_DAYS,
        indexedAt,
      })
      return { action: "recorded", status: "failed", momentCount: 0 } satisfies AnalyzeSessionConversationResult
    }

    const traceIds = session.traceIds.filter((traceId) => traceId.length === 32).map(TraceId)
    const traceDetails =
      traceIds.length > 0 ? yield* traces.listByTraceIds({ organizationId, projectId, traceIds }) : []
    const rawMessages =
      traceDetails.length > 0
        ? [...traceDetails]
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
            .flatMap((trace) => trace.allMessages)
        : [...session.lastInputMessages, ...session.outputMessages]
    const normalizedMessages = normalizeMessages(rawMessages)
    const document = documentFromMessages(normalizedMessages)
    const analysisHash = yield* hash(`${CONVERSATION_INTELLIGENCE_DETECTOR_VERSION}\0${session.sessionId}\0${document}`)
    const latest = yield* analyses.findLatest({ organizationId, projectId, sessionId })
    if (latest?.analysisHash === analysisHash && latest.analysisStatus !== "failed") {
      return { action: "skipped", reason: "hash-current" } satisfies AnalyzeSessionConversationResult
    }

    const indexedAt = new Date()
    const retentionDays = input.retentionDays ?? CONVERSATION_INTELLIGENCE_RETENTION_DAYS
    const classification = classifyInteraction(normalizedMessages)

    const baseAnalysis = {
      organizationId,
      projectId,
      sessionId,
      startTime: session.startTime,
      endTime: session.endTime,
      traceIds,
      analysisHash,
      interactionKind: classification.interactionKind,
      analysisLens: classification.analysisLens,
      statusReason: "",
      detectorVersion: CONVERSATION_INTELLIGENCE_DETECTOR_VERSION,
      retentionDays,
      indexedAt,
    } satisfies Omit<ConversationSessionAnalysis, "analysisStatus">

    if (normalizedMessages.length === 0 || document.length === 0) {
      yield* analyses.upsert({ ...baseAnalysis, analysisStatus: "skipped_empty", statusReason: "No semantic messages" })
      return { action: "recorded", status: "skipped_empty", momentCount: 0 } satisfies AnalyzeSessionConversationResult
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
      } satisfies AnalyzeSessionConversationResult
    }
    if (classification.analysisLens === "telemetry_only") {
      yield* analyses.upsert({
        ...baseAnalysis,
        analysisStatus: "skipped_non_conversation",
        statusReason: "Session does not contain both user and assistant messages",
      })
      return {
        action: "recorded",
        status: "skipped_non_conversation",
        momentCount: 0,
      } satisfies AnalyzeSessionConversationResult
    }

    const conversationCalibration = yield* loadConversationCalibration({ projectId })
    const clusteringCalibration = yield* loadClusteringCalibration({ projectId })
    const embeddedTurns = yield* embedTurns(normalizedMessages)
    const semanticSegments = segmentSemanticMoments({
      turns: embeddedTurns,
      ...(conversationCalibration ? { continuityClamps: conversationCalibration.continuity } : {}),
    })
    const ai = yield* AI

    const anchorDetected = yield* detectEmbeddingAnchorMoments({
      messages: normalizedMessages,
      turns: embeddedTurns,
      segments: semanticSegments,
      labelGates: conversationCalibration?.labelAnchors ?? null,
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
        lens: classification.analysisLens,
        messages: normalizedMessages,
      }),
    )).flatMap((moment): DetectedMoment[] => (moment === null ? [] : [moment as DetectedMoment]))

    const semanticMomentRows = yield* Effect.forEach(semanticSegments, (segment, index) =>
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
          segmentationMethod: "embedding_continuity",
          segmentationVersion: CONVERSATION_MOMENT_SEGMENTATION_VERSION,
          retentionDays,
          indexedAt,
        } satisfies ConversationSemanticMoment
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
              detectorVersion: moment.detectorVersion,
              retentionDays,
              indexedAt,
            } satisfies ConversationMomentLabel)
      }),
    ).pipe(Effect.map((labels) => labels.filter((label): label is ConversationMomentLabel => label !== null)))

    const ritualAnchors = {
      positive: yield* Effect.forEach(RITUAL_POSITIVE_ANCHORS, embedAnchorText),
      contrast: yield* Effect.forEach(RITUAL_CONTRAST_ANCHORS, embedAnchorText),
    }
    const taxonomyObservationRows = yield* Effect.forEach(semanticSegments, (segment, index) =>
      Effect.gen(function* () {
        const semanticMoment = semanticMomentRows[index]
        if (!semanticMoment) return []

        // One topic observation per moment: the full user+assistant exchange
        // text. Role-filtered intent/behaviour projections clustered by topic
        // anyway (topic vocabulary dominates raw-text embeddings), so the
        // taxonomy now clusters topics explicitly; signals carry behaviour.
        const projectionText = momentProjectionText({ turns: embeddedTurns, turnIndexes: segment.turnIndexes })
        const projections =
          projectionText === null
            ? []
            : [
                {
                  dimension: "topic" as const,
                  projectionMethod: TaxonomyProjectionMethod.MomentTextEmbedding,
                  text: projectionText,
                },
              ]

        const observations = yield* Effect.forEach(projections, (entry) =>
          Effect.gen(function* () {
            const embeddingResult = yield* ai.embed({
              text: entry.text,
              model: CONVERSATION_INTELLIGENCE_EMBEDDING_MODEL,
              dimensions: CONVERSATION_INTELLIGENCE_EMBEDDING_DIMENSIONS,
              inputType: "document",
            })
            if (embeddingResult.embedding.length === 0) return null
            if (isRitualProjection(embeddingResult.embedding, ritualAnchors, conversationCalibration?.ritual))
              return null
            const projectionHash = yield* hash(
              `${analysisHash}\0${semanticMoment.momentId}\0${entry.dimension}\0${entry.text}`,
            )
            const observationId = (yield* hash(
              `${analysisHash}\0${semanticMoment.momentId}\0${entry.dimension}\0observation`,
            )).slice(0, 24)
            const decision = yield* routeToDeepestClusterUseCase({
              projectId,
              dimension: entry.dimension,
              queryVector: embeddingResult.embedding,
              ...(clusteringCalibration === null
                ? {}
                : {
                    gates: {
                      absoluteThreshold: clusteringCalibration.assignAbsoluteThreshold,
                      relativeMargin: clusteringCalibration.assignRelativeMargin,
                    },
                  }),
            })
            return {
              organizationId,
              projectId,
              observationId,
              sessionId,
              analysisHash,
              momentId: semanticMoment.momentId,
              dimension: entry.dimension,
              projectionMethod: entry.projectionMethod,
              projectionHash,
              projectionMetadata: {
                sourceTurnIndexes: [...segment.turnIndexes],
                summary: entry.text,
              },
              embedding: [...embeddingResult.embedding],
              assignedClusterId: decision.clusterId === null ? null : TaxonomyClusterId(decision.clusterId),
              assignmentConfidence: decision.confidence,
              assignmentMethod:
                decision.method === "centroid_online"
                  ? TaxonomyObservationAssignmentMethod.CentroidOnline
                  : TaxonomyObservationAssignmentMethod.Noise,
              reassignmentRunId: null,
              startTime: semanticMoment.startTime,
              endTime: semanticMoment.endTime,
              retentionDays,
              indexedAt,
            } satisfies TaxonomyMomentObservation
          }),
        )
        return observations.flatMap((observation) => (observation === null ? [] : [observation]))
      }),
    ).pipe(Effect.map((groups) => groups.flat() as TaxonomyMomentObservation[]))

    // Centroid increments are not idempotent, but the activity retries are:
    // the observation rows act as applied-markers. They are written FIRST, a
    // retry skips the increment for any id that already existed, and a crash
    // between the two at worst loses one increment (gardening self-corrects)
    // instead of double-counting it.
    const alreadyApplied = new Set(
      yield* taxonomyObservations.filterExistingIds({
        organizationId,
        projectId,
        observationIds: taxonomyObservationRows.map((row) => row.observationId),
      }),
    )
    yield* taxonomyObservations.upsertMany(taxonomyObservationRows)
    yield* Effect.forEach(
      taxonomyObservationRows.filter(
        (row) =>
          row.assignmentMethod === TaxonomyObservationAssignmentMethod.CentroidOnline &&
          row.assignedClusterId !== null &&
          !alreadyApplied.has(row.observationId),
      ),
      (row) =>
        assignObservationToClusterUseCase({
          organizationId,
          projectId,
          clusterId: row.assignedClusterId as NonNullable<typeof row.assignedClusterId>,
          embedding: row.embedding,
          observedAt: row.startTime,
          assignedAt: indexedAt,
        }),
    )

    const analysis: ConversationSessionAnalysis = {
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
    } satisfies AnalyzeSessionConversationResult
  }).pipe(
    Effect.catch((error: unknown) =>
      Effect.gen(function* () {
        const analyses = yield* ConversationSessionAnalysisRepository
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
          interactionKind: "unknown",
          analysisLens: "telemetry_only",
          analysisStatus: "failed",
          statusReason: error instanceof Error ? error.message : "Session analysis failed",
          detectorVersion: String(CONVERSATION_INTELLIGENCE_DETECTOR_VERSION),
          retentionDays: input.retentionDays ?? CONVERSATION_INTELLIGENCE_RETENTION_DAYS,
          indexedAt,
        })
        return { action: "recorded", status: "failed", momentCount: 0 } satisfies AnalyzeSessionConversationResult
      }),
    ),
    Effect.withSpan("conversationIntelligence.analyzeSessionConversation"),
  )
