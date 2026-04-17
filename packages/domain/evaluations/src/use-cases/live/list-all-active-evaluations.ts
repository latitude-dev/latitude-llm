import type { ProjectId } from "@domain/shared"
import { Effect } from "effect"

import type { Evaluation } from "../../entities/evaluation.ts"
import { EvaluationRepository } from "../../ports/evaluation-repository.ts"

const ACTIVE_EVALUATION_SCAN_PAGE_SIZE = 100

export const listAllActiveEvaluations = ({ projectId }: { readonly projectId: ProjectId }) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", projectId)

    const evaluationRepository = yield* EvaluationRepository
    const evaluations: Evaluation[] = []
    let offset = 0

    while (true) {
      const page = yield* evaluationRepository.listByProjectId({
        projectId,
        options: {
          lifecycle: "active",
          limit: ACTIVE_EVALUATION_SCAN_PAGE_SIZE,
          offset,
        },
      })

      evaluations.push(...page.items)

      if (!page.hasMore) {
        return evaluations
      }

      offset += page.limit
    }
  }).pipe(Effect.withSpan("evaluations.listAllActiveEvaluations"))
