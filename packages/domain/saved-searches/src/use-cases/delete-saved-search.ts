import { OutboxEventWriter } from "@domain/events"
import { type SavedSearchId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"

export const deleteSavedSearch = Effect.fn("savedSearches.deleteSavedSearch")(function* (args: {
  readonly savedSearchId: SavedSearchId
}) {
  yield* Effect.annotateCurrentSpan("savedSearchId", args.savedSearchId)

  const repo = yield* SavedSearchRepository
  const sqlClient = yield* SqlClient
  const existing = yield* repo.findById(args.savedSearchId)

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      yield* repo.softDelete(args.savedSearchId)

      // Drives the monitors source cascade; atomic with the delete.
      const outboxEventWriter = yield* OutboxEventWriter
      yield* outboxEventWriter.write({
        eventName: "SavedSearchDeleted",
        aggregateType: "saved-search",
        aggregateId: existing.id,
        organizationId: existing.organizationId,
        payload: {
          organizationId: existing.organizationId,
          projectId: existing.projectId,
          searchId: existing.id,
        },
      })
    }),
  )
})
