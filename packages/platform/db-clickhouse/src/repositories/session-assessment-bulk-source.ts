import {
  SessionAssessmentBulkTelemetrySource,
  type SessionAssessmentBulkTelemetrySourceShape,
} from "@domain/agent-score"
import {
  type SessionAnalysis,
  SessionAnalysisRepository,
  type SessionMomentLabel,
  SessionMomentLabelRepository,
  type SessionSemanticMoment,
  SessionSemanticMomentRepository,
} from "@domain/conversation-intelligence"
import { type FlaggerScreeningDecision, FlaggerScreeningDecisionRepository } from "@domain/flaggers"
import { ChSqlClient, type SessionId, TraceId } from "@domain/shared"
import { SessionRepository, type Span, SpanRepository } from "@domain/spans"
import { Effect, Layer } from "effect"

const append = <Value>(map: Map<string, Value[]>, key: string, value: Value) => {
  const values = map.get(key) ?? []
  values.push(value)
  map.set(key, values)
}

export const SessionAssessmentBulkTelemetrySourceLive = Layer.effect(
  SessionAssessmentBulkTelemetrySource,
  Effect.gen(function* () {
    const chSqlClient = yield* ChSqlClient
    const sessionRepository = yield* SessionRepository
    const spanRepository = yield* SpanRepository
    const analysisRepository = yield* SessionAnalysisRepository
    const momentRepository = yield* SessionSemanticMomentRepository
    const labelRepository = yield* SessionMomentLabelRepository
    const screeningRepository = yield* FlaggerScreeningDecisionRepository

    return {
      read: (input) =>
        Effect.gen(function* () {
          const sessions = yield* sessionRepository.listDetailsBySessionIds({
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionIds: input.sessionIds,
            endTimeTo: input.cutoff,
          })
          const traceIds = [...new Set(sessions.flatMap((session) => session.traceIds.map(TraceId)))]
          const [spans, analyses, moments, labels, screeningDecisions] = yield* Effect.all(
            [
              spanRepository.listByTraceIds({
                organizationId: input.organizationId,
                projectId: input.projectId,
                traceIds,
                startTimeTo: input.cutoff,
              }),
              analysisRepository.listLatestBySessions({
                organizationId: input.organizationId,
                projectId: input.projectId,
                sessionIds: input.sessionIds,
                indexedAtTo: input.cutoff,
              }),
              momentRepository.listBySessions({
                organizationId: input.organizationId,
                projectId: input.projectId,
                sessionIds: input.sessionIds,
                indexedAtTo: input.cutoff,
              }),
              labelRepository.listBySessions({
                organizationId: input.organizationId,
                projectId: input.projectId,
                sessionIds: input.sessionIds,
                indexedAtTo: input.cutoff,
              }),
              screeningRepository.listLatestBySessions(input),
            ],
            { concurrency: "unbounded" },
          )

          const traceSessionIds = new Map(
            sessions.flatMap((session) =>
              session.traceIds.map((traceId) => [String(traceId), session.sessionId] as const),
            ),
          )
          const spansBySession = new Map<string, Span[]>()
          const analysesBySession = new Map<string, SessionAnalysis>(
            analyses.map((analysis) => [analysis.sessionId, analysis]),
          )
          const momentsBySession = new Map<string, SessionSemanticMoment[]>()
          const labelsBySession = new Map<string, SessionMomentLabel[]>()
          const screeningBySession = new Map<string, FlaggerScreeningDecision[]>()

          for (const span of spans) {
            const sessionId = traceSessionIds.get(String(span.traceId))
            if (sessionId) append(spansBySession, sessionId, span)
          }
          for (const moment of moments) {
            const analysis = analysesBySession.get(moment.sessionId)
            if (
              !analysis ||
              (analysis.analysisStatus === "analyzed" && analysis.analysisHash === moment.analysisHash)
            ) {
              append(momentsBySession, moment.sessionId, moment)
            }
          }
          for (const label of labels) {
            const analysis = analysesBySession.get(label.sessionId)
            if (!analysis || (analysis.analysisStatus === "analyzed" && analysis.analysisHash === label.analysisHash)) {
              append(labelsBySession, label.sessionId, label)
            }
          }
          for (const decision of screeningDecisions) append(screeningBySession, decision.sessionId, decision)

          const sessionsById = new Map(sessions.map((session) => [session.sessionId, session]))
          return input.sessionIds.flatMap((sessionId: SessionId) => {
            const session = sessionsById.get(sessionId)
            if (!session) return []
            return [
              {
                session,
                spans: spansBySession.get(sessionId) ?? [],
                moments: {
                  moments: momentsBySession.get(sessionId) ?? [],
                  labels: labelsBySession.get(sessionId) ?? [],
                },
                screeningDecisions: screeningBySession.get(sessionId) ?? [],
              },
            ]
          })
        }).pipe(Effect.provideService(ChSqlClient, chSqlClient)),
    } satisfies SessionAssessmentBulkTelemetrySourceShape
  }),
)
