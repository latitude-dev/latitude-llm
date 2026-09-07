import { TraceId } from "@domain/shared"
import { Effect } from "effect"
import {
  SessionAssessmentBulkJudgmentSource,
  type SessionAssessmentBulkScope,
  SessionAssessmentBulkTelemetrySource,
} from "../ports/session-assessment-sources.ts"
import { resolveSessionAssessment } from "../resolver/resolve-session-assessment.ts"
import { readSessionAssessmentSources } from "./read-session-assessment-sources.ts"

export const readSessionAssessmentBatch = (input: SessionAssessmentBulkScope) =>
  Effect.gen(function* () {
    if (input.sessionIds.length === 0) return []

    const telemetrySource = yield* SessionAssessmentBulkTelemetrySource
    const judgmentSource = yield* SessionAssessmentBulkJudgmentSource
    const telemetry = yield* telemetrySource.read(input)
    const judgments = yield* judgmentSource.read({
      ...input,
      sessions: telemetry.map(({ session }) => ({
        sessionId: session.sessionId,
        traceIds: session.traceIds.map(TraceId),
      })),
    })
    const judgmentsBySession = new Map(judgments.map((facts) => [facts.sessionId, facts]))

    return yield* Effect.forEach(
      telemetry,
      (facts) => {
        const judgment = judgmentsBySession.get(facts.session.sessionId)
        return readSessionAssessmentSources({
          ...facts,
          scores: judgment?.scores ?? [],
          signals: judgment?.signals ?? [],
        }).pipe(Effect.map(resolveSessionAssessment))
      },
      { concurrency: "unbounded" },
    )
  })
