import {
  SESSION_ASSESSMENT_CONTENT_BUDGET,
  SessionAssessmentBulkTelemetrySource,
  type SessionAssessmentBulkTelemetrySourceShape,
} from "@domain/agent-score"
import {
  type SessionAnalysis,
  SessionAnalysisRepository,
  SessionMomentLabelRepository,
  SessionSemanticMomentRepository,
} from "@domain/conversation-intelligence"
import { FlaggerScreeningDecisionRepository } from "@domain/flaggers"
import { MemoryRepository } from "@domain/memories"
import { TraceId } from "@domain/shared"
import { SessionRepository, SpanRepository } from "@domain/spans"
import { Effect, Layer } from "effect"

const groupByKey = <Value>(
  items: readonly Value[],
  keyOf: (value: Value) => string | undefined,
): Map<string, Value[]> => {
  const grouped = new Map<string, Value[]>()
  for (const item of items) {
    const key = keyOf(item)
    if (key === undefined) continue
    const values = grouped.get(key) ?? []
    values.push(item)
    grouped.set(key, values)
  }
  return grouped
}

/** Moments and labels of an unanalyzed session are kept; a superseded analysis generation is not. */
const isAuthoritativeGeneration = (analysis: SessionAnalysis | undefined, analysisHash: string): boolean =>
  !analysis || (analysis.analysisStatus === "analyzed" && analysis.analysisHash === analysisHash)

export const SessionAssessmentBulkTelemetrySourceLive = Layer.effect(
  SessionAssessmentBulkTelemetrySource,
  Effect.gen(function* () {
    const sessionRepository = yield* SessionRepository
    const spanRepository = yield* SpanRepository
    const analysisRepository = yield* SessionAnalysisRepository
    const momentRepository = yield* SessionSemanticMomentRepository
    const labelRepository = yield* SessionMomentLabelRepository
    const screeningRepository = yield* FlaggerScreeningDecisionRepository
    const memoryRepository = yield* MemoryRepository

    return {
      read: (input) =>
        Effect.gen(function* () {
          const sessions = yield* sessionRepository.listDetailsBySessionIds({
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionIds: input.sessionIds,
            cutoff: input.cutoff,
          })
          const traceIds = [...new Set(sessions.flatMap((session) => session.traceIds.map(TraceId)))]
          const sessionByTraceId = new Map(
            sessions.flatMap((session) =>
              session.traceIds.map((traceId) => [String(traceId), String(session.sessionId)] as const),
            ),
          )
          const scope = { organizationId: input.organizationId, projectId: input.projectId }
          const traceScope = { ...scope, traceIds, startTimeTo: input.cutoff }
          const sessionScope = { ...scope, sessionIds: input.sessionIds, indexedAtTo: input.cutoff }

          const [spans, generations, toolCalls, memoryEvents, analyses, moments, labels, screeningDecisions] =
            yield* Effect.all(
              [
                spanRepository.listByTraceIds(traceScope),
                spanRepository.listGenerationFactsByTraceIds({
                  ...traceScope,
                  contentBudget: SESSION_ASSESSMENT_CONTENT_BUDGET,
                  sessionKeyByTraceId: sessionByTraceId,
                }),
                spanRepository.listToolCallFactsByTraceIds(traceScope),
                memoryRepository.readMemoryEventsBySessionIds({
                  ...scope,
                  sessionIds: input.sessionIds,
                  endTimeTo: input.cutoff,
                }),
                analysisRepository.listLatestBySessions(sessionScope),
                momentRepository.listBySessions(sessionScope),
                labelRepository.listBySessions(sessionScope),
                screeningRepository.listLatestBySessions(input),
              ],
              { concurrency: "unbounded" },
            )

          const sessionsById = new Map(sessions.map((session) => [session.sessionId, session]))
          const analysesBySession = new Map<string, SessionAnalysis>(
            analyses.map((analysis) => [analysis.sessionId, analysis]),
          )
          const sessionOfTrace = (traceId: string) => sessionByTraceId.get(traceId)
          const spansBySession = groupByKey(spans, (span) => sessionOfTrace(String(span.traceId)))
          const generationsBySession = groupByKey(generations, (fact) => sessionOfTrace(String(fact.traceId)))
          const toolCallsBySession = groupByKey(toolCalls, (fact) => sessionOfTrace(String(fact.traceId)))
          const memoryEventsBySession = groupByKey(memoryEvents, (event) =>
            sessionsById.has(event.sessionId) ? event.sessionId : undefined,
          )
          const momentsBySession = groupByKey(moments, (moment) =>
            isAuthoritativeGeneration(analysesBySession.get(moment.sessionId), moment.analysisHash)
              ? moment.sessionId
              : undefined,
          )
          const labelsBySession = groupByKey(labels, (label) =>
            isAuthoritativeGeneration(analysesBySession.get(label.sessionId), label.analysisHash)
              ? label.sessionId
              : undefined,
          )
          const screeningBySession = groupByKey(screeningDecisions, (decision) =>
            analysesBySession.get(decision.sessionId)?.analysisHash === decision.analysisHash
              ? decision.sessionId
              : undefined,
          )

          return input.sessionIds.flatMap((sessionId) => {
            const session = sessionsById.get(sessionId)
            if (!session) return []
            return [
              {
                session,
                spans: spansBySession.get(sessionId) ?? [],
                generations: generationsBySession.get(sessionId) ?? [],
                toolCalls: toolCallsBySession.get(sessionId) ?? [],
                memoryEvents: memoryEventsBySession.get(sessionId) ?? [],
                moments: {
                  moments: momentsBySession.get(sessionId) ?? [],
                  labels: labelsBySession.get(sessionId) ?? [],
                },
                screeningDecisions: screeningBySession.get(sessionId) ?? [],
              },
            ]
          })
        }),
    } satisfies SessionAssessmentBulkTelemetrySourceShape
  }),
)
