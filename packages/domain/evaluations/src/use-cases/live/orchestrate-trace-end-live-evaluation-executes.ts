import { ScoreRepository } from "@domain/scores"
import type { ProjectId, SessionId, TraceId } from "@domain/shared"
import { Effect } from "effect"

import type { Evaluation } from "../../entities/evaluation.ts"
import { buildLiveEvaluationExecutePublication } from "../../helpers.ts"
import type { PublishLiveEvaluationExecuteInput } from "../../ports/live-evaluation-queue-publisher.ts"

export const orchestrateTraceEndLiveEvaluationExecutesUseCase =
  ({
    publishExecute,
  }: {
    readonly publishExecute: (input: PublishLiveEvaluationExecuteInput) => Effect.Effect<void, unknown, never>
  }) =>
  (input: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
    readonly traceProjectId: ProjectId
    readonly traceRowId: TraceId
    readonly sessionId: SessionId | null
    readonly selectedEvaluations: readonly Evaluation[]
  }) =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("projectId", input.projectId)
      yield* Effect.annotateCurrentSpan("traceId", input.traceId)
      yield* Effect.annotateCurrentSpan("evaluation.count", input.selectedEvaluations.length)

      const scoreRepository = yield* ScoreRepository
      let skippedTurnCount = 0
      let publishedExecuteCount = 0

      for (const evaluation of input.selectedEvaluations) {
        if (evaluation.trigger.turn !== "first") {
          yield* publishExecute(
            buildLiveEvaluationExecutePublication({
              organizationId: input.organizationId,
              projectId: input.projectId,
              traceId: input.traceId,
              sessionId: input.sessionId,
              evaluation,
            }),
          )
          publishedExecuteCount += 1
          continue
        }

        const alreadyExists = yield* scoreRepository.existsByEvaluationIdAndScope({
          projectId: input.traceProjectId,
          evaluationId: evaluation.id,
          traceId: input.traceRowId,
          sessionId: input.sessionId,
        })

        if (alreadyExists) {
          skippedTurnCount += 1
          continue
        }

        yield* publishExecute(
          buildLiveEvaluationExecutePublication({
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            sessionId: input.sessionId,
            evaluation,
          }),
        )
        publishedExecuteCount += 1
      }

      return { skippedTurnCount, publishedExecuteCount }
    }).pipe(Effect.withSpan("evaluations.orchestrateTraceEndLiveEvaluationExecutes"))
