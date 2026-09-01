import type { Score, ScoreListPage } from "@domain/scores"
import { Effect } from "effect"
import { EvaluationRepository } from "../ports/evaluation-repository.ts"

export type ScoreWithEvaluationSignal = Score & {
  readonly evaluationSignalId: string | null
}

export type ScoreListPageWithEvaluationSignals = {
  readonly items: readonly ScoreWithEvaluationSignal[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

const evaluationIdsForPage = (page: ScoreListPage): readonly string[] => [
  ...new Set(page.items.filter((score) => score.sourceType === "evaluation").map((score) => score.sourceId)),
]

const loadParentSignalByEvaluationId = (evaluationIds: readonly string[]) =>
  Effect.gen(function* () {
    const signalByEvaluationId = new Map<string, string>()
    if (evaluationIds.length === 0) return signalByEvaluationId

    const evaluationRepository = yield* EvaluationRepository
    const found = yield* Effect.forEach(
      evaluationIds,
      (id) => evaluationRepository.findById(id).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null))),
      { concurrency: 8 },
    )

    for (const evaluation of found) {
      if (!evaluation) continue
      signalByEvaluationId.set(String(evaluation.id), evaluation.signalId)
    }
    return signalByEvaluationId
  })

const withParentSignal =
  (signalByEvaluationId: ReadonlyMap<string, string>) =>
  (score: Score): ScoreWithEvaluationSignal => ({
    ...score,
    evaluationSignalId: score.sourceType === "evaluation" ? (signalByEvaluationId.get(score.sourceId) ?? null) : null,
  })

export const attachEvaluationParentSignalsUseCase = Effect.fn("evaluations.attachEvaluationParentSignals")(function* (
  page: ScoreListPage,
) {
  const evaluationIds = evaluationIdsForPage(page)
  yield* Effect.annotateCurrentSpan("evaluation.count", evaluationIds.length)

  const signalByEvaluationId = yield* loadParentSignalByEvaluationId(evaluationIds)
  return {
    items: page.items.map(withParentSignal(signalByEvaluationId)),
    hasMore: page.hasMore,
    limit: page.limit,
    offset: page.offset,
  } satisfies ScoreListPageWithEvaluationSignals
})
