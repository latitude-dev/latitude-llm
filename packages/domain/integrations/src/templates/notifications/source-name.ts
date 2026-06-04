import { IssueRepository } from "@domain/issues"
import { SavedSearchRepository } from "@domain/saved-searches"
import { IssueId, SavedSearchId } from "@domain/shared"
import { Effect } from "effect"

/** Live-resolve the incident source's display name (issue title or saved search name). `null` if missing/deleted. */
export const resolveSourceName = (input: { readonly sourceType: string; readonly sourceId: string }) =>
  Effect.gen(function* () {
    if (input.sourceType === "savedSearch") {
      const repo = yield* SavedSearchRepository
      return yield* repo.findById(SavedSearchId(input.sourceId)).pipe(
        Effect.map((s): string | null => s.name),
        Effect.catchTag("SavedSearchNotFoundError", () => Effect.succeed(null)),
        Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
      )
    }
    const repo = yield* IssueRepository
    return yield* repo.findById(IssueId(input.sourceId)).pipe(
      Effect.map((i): string | null => i.name),
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
    )
  })
