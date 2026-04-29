import { ScoreRepository, writeScoreUseCase } from "@domain/scores"
import type { ProjectId, ScoreId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { FLAGGER_DRAFT_DEFAULTS } from "../constants.ts"

interface UpsertFlaggerAnnotationScoreInput {
  readonly id?: ScoreId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly sessionId: string | null
  readonly simulationId: string | null
  readonly feedback: string
}

type UpsertFlaggerAnnotationScoreResult =
  | { readonly status: "existing"; readonly scoreId: string }
  | { readonly status: "written"; readonly scoreId: string }

/**
 * Dedups + writes the canonical flagger-authored annotation score
 * (`source: "annotation"`, `sourceId: "SYSTEM"`, `draftedAt: null`,
 * `metadata: { rawFeedback }`). Shared by the deterministic
 * `process-flaggers` matched path and the LLM `save-flagger-annotation`
 * path so they can't drift.
 */
export const upsertFlaggerAnnotationScore = (input: UpsertFlaggerAnnotationScoreInput) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const existing = yield* scoreRepository.findPublishedSystemAnnotationByTraceAndFeedback({
      projectId: input.projectId,
      traceId: input.traceId,
      feedback: input.feedback,
    })

    if (existing !== null) {
      return { status: "existing", scoreId: existing.id } satisfies UpsertFlaggerAnnotationScoreResult
    }

    const written = yield* writeScoreUseCase({
      ...(input.id !== undefined ? { id: input.id } : {}),
      projectId: input.projectId,
      source: "annotation",
      sourceId: "SYSTEM",
      sessionId: input.sessionId,
      traceId: input.traceId,
      spanId: null,
      simulationId: input.simulationId,
      issueId: null,
      annotatorId: null,
      value: FLAGGER_DRAFT_DEFAULTS.value,
      passed: FLAGGER_DRAFT_DEFAULTS.passed,
      feedback: input.feedback,
      metadata: { rawFeedback: input.feedback },
      error: null,
      draftedAt: null,
    })

    return { status: "written", scoreId: written.id } satisfies UpsertFlaggerAnnotationScoreResult
  })
