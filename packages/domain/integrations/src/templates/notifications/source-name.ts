import { SignalId, UserId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { UserRepository } from "@domain/users"
import { Effect } from "effect"

export const resolveSourceName = (input: { readonly sourceType: string; readonly sourceId: string }) =>
  Effect.gen(function* () {
    if (input.sourceType !== "signal") return null
    const repo = yield* SignalRepository
    return yield* repo.findById(SignalId(input.sourceId)).pipe(
      Effect.map((i): string | null => i.name),
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
    )
  })

/**
 * Live-resolve the assignee's display name from the payload's snapshotted
 * `assigneeId`. `null` when unassigned, the field predates the snapshot, or
 * the user row is gone — renderers skip the "Assigned to" suffix then.
 */
export const resolveAssigneeName = (assigneeId: string | null | undefined) =>
  Effect.gen(function* () {
    if (!assigneeId) return null
    const users = yield* UserRepository
    return yield* users.findById(UserId(assigneeId)).pipe(
      Effect.map((user): string | null => (user.name?.trim().length ? user.name : user.email)),
      Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
      Effect.catchTag("RepositoryError", () => Effect.succeed(null)),
    )
  })
