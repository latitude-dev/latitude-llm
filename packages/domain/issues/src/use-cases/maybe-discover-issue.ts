import { ScoreRepository, shouldDiscoverIssue } from "@domain/scores"
import { ScoreId } from "@domain/shared"
import { Effect } from "effect"
import { type DiscoverIssueInput, type DiscoverIssueResult, discoverIssueUseCase } from "./discover-issue.ts"

export type MaybeDiscoverIssueResult =
  | { readonly skipped: true }
  | { readonly skipped: false; readonly result: DiscoverIssueResult }

/**
 * Reacts to score-created signals: loads the score and runs
 * {@link discoverIssueUseCase} only when the score is eligible for discovery.
 * Keeps publishers agnostic of which consumers care and under what conditions.
 */
export const maybeDiscoverIssueUseCase = (input: DiscoverIssueInput) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const score = yield* scoreRepository
      .findById(ScoreId(input.scoreId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (score === null || !shouldDiscoverIssue(score)) {
      return { skipped: true } satisfies MaybeDiscoverIssueResult
    }

    const result = yield* discoverIssueUseCase(input)
    return { skipped: false, result } satisfies MaybeDiscoverIssueResult
  })
