import { ScoreRepository, writeScoreUseCase } from "@domain/scores"
import type { ProjectId, ScoreId, SessionId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { FLAGGER_DRAFT_DEFAULTS } from "../constants.ts"

interface UpsertFlaggerAnnotationScoreInput {
  readonly id?: ScoreId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly sessionId: string | null
  readonly simulationId: string | null
  readonly feedback: string
  readonly flaggerSlug: string
  readonly messageIndex?: number | undefined
  readonly contentHash?: string | undefined
  /** Absent for deterministic detections and cached generations — neither leaves a trace to grade. */
  readonly flaggerTraceId?: string | undefined
}

type UpsertFlaggerAnnotationScoreResult =
  | { readonly status: "existing"; readonly scoreId: string }
  | { readonly status: "written"; readonly scoreId: string }

// One published SYSTEM score per (projectId, sessionId, flaggerSlug, contentHash):
// the anchored content hash stays stable across re-screens and compaction
// renumbering, unlike feedback text or message indices.
export const findFlaggerAnnotationByAnchor = (input: {
  readonly projectId: ProjectId
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly contentHash: string
}) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const published = yield* scoreRepository.listPublishedSystemAnnotationsBySession({
      projectId: input.projectId,
      sessionId: input.sessionId as SessionId,
    })

    return (
      published.find((score) => {
        const metadata = score.metadata as { flaggerSlug?: string; contentHash?: string } | null
        return metadata?.flaggerSlug === input.flaggerSlug && metadata?.contentHash === input.contentHash
      }) ?? null
    )
  })

/**
 * Dedups + writes the canonical flagger-authored annotation score. Shared by
 * the deterministic screening matched path and the LLM save path so they can't
 * drift. Two dedup layers: exact feedback per trace, then the content anchor
 * above (LLM feedback is nondeterministic across re-runs).
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

    if (input.contentHash && input.sessionId) {
      const anchored = yield* findFlaggerAnnotationByAnchor({
        projectId: input.projectId,
        sessionId: input.sessionId,
        flaggerSlug: input.flaggerSlug,
        contentHash: input.contentHash,
      })

      if (anchored !== null) {
        return { status: "existing", scoreId: anchored.id } satisfies UpsertFlaggerAnnotationScoreResult
      }
    }

    const written = yield* writeScoreUseCase({
      ...(input.id !== undefined ? { id: input.id } : {}),
      projectId: input.projectId,
      sourceType: "annotation",
      sourceId: "SYSTEM",
      sessionId: input.sessionId,
      traceId: input.traceId,
      spanId: null,
      simulationId: input.simulationId,
      signalId: null,
      annotatorId: null,
      value: FLAGGER_DRAFT_DEFAULTS.value,
      passed: FLAGGER_DRAFT_DEFAULTS.passed,
      feedback: input.feedback,
      metadata: {
        rawFeedback: input.feedback,
        flaggerSlug: input.flaggerSlug,
        ...(input.messageIndex !== undefined ? { messageIndex: input.messageIndex } : {}),
        ...(input.contentHash !== undefined ? { contentHash: input.contentHash } : {}),
        ...(input.flaggerTraceId !== undefined ? { flaggerTraceId: input.flaggerTraceId } : {}),
      },
      error: null,
      draftedAt: null,
    })

    return { status: "written", scoreId: written.id } satisfies UpsertFlaggerAnnotationScoreResult
  })
