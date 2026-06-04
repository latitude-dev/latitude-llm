import { IssueRepository } from "@domain/issues"
import { SavedSearchRepository } from "@domain/saved-searches"
import { IssueId, SavedSearchId } from "@domain/shared"
import { Effect } from "effect"

/** Live-resolved display name of an incident's source. `description` is issue-only. `null` name when the source was deleted. */
interface ResolvedIncidentSource {
  readonly name: string | null
  readonly description: string | null
}

const loadError = (cause: unknown) => ({
  _tag: "RenderNotificationEmailError" as const,
  message: "Failed to load incident source",
  cause,
})

const MISSING: ResolvedIncidentSource = { name: null, description: null }

/** Resolve the source name by `sourceId`, mirroring how the issue name is resolved — the saved search is the source for `savedSearch.*`. */
export const resolveIncidentSource = (input: { readonly sourceType: string; readonly sourceId: string }) =>
  Effect.gen(function* () {
    if (input.sourceType === "savedSearch") {
      const repo = yield* SavedSearchRepository
      return yield* repo.findById(SavedSearchId(input.sourceId)).pipe(
        Effect.map((s): ResolvedIncidentSource => ({ name: s.name, description: null })),
        Effect.catchTag("SavedSearchNotFoundError", () => Effect.succeed(MISSING)),
        Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
      )
    }
    const repo = yield* IssueRepository
    return yield* repo.findById(IssueId(input.sourceId)).pipe(
      Effect.map((i): ResolvedIncidentSource => ({ name: i.name, description: i.description ?? null })),
      Effect.catchTag("NotFoundError", () => Effect.succeed(MISSING)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )
  })
