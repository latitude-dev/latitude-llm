import { TraceId } from "@domain/shared"
import { Effect } from "effect"
import { SESSION_ASSESSMENT_RESOLVER_CONCURRENCY } from "../constants.ts"
import type { LatencyReferenceArtifact } from "../entities/latency-reference-artifact.ts"
import {
  SessionAssessmentBulkJudgmentSource,
  type SessionAssessmentBulkScope,
  SessionAssessmentBulkTelemetrySource,
} from "../ports/session-assessment-sources.ts"
import { resolveSessionAssessment } from "../resolver/resolve-session-assessment.ts"
import { readSessionAssessmentSources } from "./read-session-assessment-sources.ts"

export interface ReadSessionAssessmentInputBatchInput extends SessionAssessmentBulkScope {
  readonly latencyArtifact?: LatencyReferenceArtifact
}

export const readSessionAssessmentInputBatch = (input: ReadSessionAssessmentInputBatchInput) =>
  Effect.gen(function* () {
    if (input.sessionIds.length === 0) return []
    const { latencyArtifact, ...scope } = input

    const telemetrySource = yield* SessionAssessmentBulkTelemetrySource
    const judgmentSource = yield* SessionAssessmentBulkJudgmentSource
    const telemetry = yield* telemetrySource.read(scope)
    if (telemetry.length === 0) return []

    const judgments = yield* judgmentSource.read({
      ...scope,
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
          ...(latencyArtifact ? { latencyArtifact } : {}),
        })
      },
      { concurrency: SESSION_ASSESSMENT_RESOLVER_CONCURRENCY },
    )
  })

export const readSessionAssessmentBatch = (input: ReadSessionAssessmentInputBatchInput) =>
  readSessionAssessmentInputBatch(input).pipe(Effect.map((assessments) => assessments.map(resolveSessionAssessment)))
