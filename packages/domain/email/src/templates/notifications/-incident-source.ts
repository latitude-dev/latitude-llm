import { SavedSearchRepository } from "@domain/saved-searches"
import { SavedSearchId, SignalId, UserId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { UserRepository } from "@domain/users"
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
    const repo = yield* SignalRepository
    return yield* repo.findById(SignalId(input.sourceId)).pipe(
      Effect.map((i): ResolvedIncidentSource => ({ name: i.name, description: i.description ?? null })),
      Effect.catchTag("NotFoundError", () => Effect.succeed(MISSING)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )
  })

/**
 * Live-resolved display name of the issue's assignee from the payload's
 * snapshotted `assigneeId` (the name itself is never snapshotted). `null`
 * when unassigned, the field predates the snapshot, or the user row is
 * gone — templates skip the "Assigned to" row in all three cases.
 */
export const resolveAssigneeName = (assigneeId: string | null | undefined) =>
  Effect.gen(function* () {
    if (!assigneeId) return null
    const users = yield* UserRepository
    return yield* users.findById(UserId(assigneeId)).pipe(
      Effect.map((user) => (user.name?.trim().length ? user.name : user.email)),
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", (cause) => Effect.fail(loadError(cause))),
    )
  })
