import { SessionAssessmentBulkJudgmentSource, type SessionAssessmentBulkJudgmentSourceShape } from "@domain/agent-score"
import { type Score, ScoreRepository } from "@domain/scores"
import { type SessionId, SignalId, SqlClient } from "@domain/shared"
import { SignalRepository, type SignalWithLifecycle } from "@domain/signals"
import { Effect, Layer } from "effect"

const append = <Value>(map: Map<string, Value[]>, key: string, value: Value) => {
  const values = map.get(key) ?? []
  values.push(value)
  map.set(key, values)
}

export const SessionAssessmentBulkJudgmentSourceLive = Layer.effect(
  SessionAssessmentBulkJudgmentSource,
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    const scoreRepository = yield* ScoreRepository
    const signalRepository = yield* SignalRepository

    return {
      read: (input) =>
        Effect.gen(function* () {
          const traceIds = [...new Set(input.sessions.flatMap((session) => session.traceIds))]
          const scores = yield* scoreRepository.listBySessionsAndTraces({
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionIds: input.sessionIds,
            traceIds,
            createdAtTo: input.cutoff,
          })
          const signalIds = [...new Set(scores.flatMap((score) => (score.signalId ? [SignalId(score.signalId)] : [])))]
          const signals =
            signalIds.length === 0 ? [] : yield* signalRepository.findByIds({ projectId: input.projectId, signalIds })

          const requestedSessionIds = new Set(input.sessionIds.map(String))
          const traceSessionIds = new Map(
            input.sessions.flatMap((session) =>
              session.traceIds.map((traceId) => [String(traceId), session.sessionId] as const),
            ),
          )
          const scoresBySession = new Map<string, Score[]>()
          for (const score of scores) {
            const sessionId =
              score.sessionId && requestedSessionIds.has(String(score.sessionId))
                ? score.sessionId
                : score.traceId
                  ? traceSessionIds.get(String(score.traceId))
                  : undefined
            if (sessionId) append(scoresBySession, sessionId, score)
          }

          const signalsById = new Map<string, SignalWithLifecycle>(signals.map((signal) => [signal.id, signal]))
          return input.sessions.map(({ sessionId }: { readonly sessionId: SessionId }) => {
            const sessionScores = scoresBySession.get(sessionId) ?? []
            const sessionSignals = [
              ...new Set(sessionScores.flatMap((score) => (score.signalId ? [score.signalId] : []))),
            ].flatMap((signalId) => {
              const signal = signalsById.get(signalId)
              return signal ? [signal] : []
            })
            return { sessionId, scores: sessionScores, signals: sessionSignals }
          })
        }).pipe(Effect.provideService(SqlClient, sqlClient)),
    } satisfies SessionAssessmentBulkJudgmentSourceShape
  }),
)
