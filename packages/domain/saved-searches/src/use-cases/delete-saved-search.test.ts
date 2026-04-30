import { ProjectId, SavedSearchId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SavedSearch } from "../entities/saved-search.ts"
import { SavedSearchNotFoundError } from "../errors.ts"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"
import { createFakeSavedSearchRepository } from "../testing/fake-saved-search-repository.ts"
import { deleteSavedSearch } from "./delete-saved-search.ts"
import { listSavedSearches } from "./list-saved-searches.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const CREATED_BY = UserId("u".repeat(24))

const seed: SavedSearch = {
  id: SavedSearchId("1".repeat(24)),
  organizationId: "fake-org".padEnd(24, "0") as SavedSearch["organizationId"],
  projectId: PROJECT_ID,
  slug: "errors",
  name: "Errors",
  query: "x",
  filterSet: {},
  assignedUserId: null,
  createdByUserId: CREATED_BY,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeLayer() {
  const { repository } = createFakeSavedSearchRepository([seed])
  return Layer.mergeAll(
    Layer.succeed(SavedSearchRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
}

describe("deleteSavedSearch", () => {
  it("soft deletes the row and excludes it from list", async () => {
    const layer = makeLayer()
    const page = await Effect.runPromise(
      Effect.gen(function* () {
        yield* deleteSavedSearch({ savedSearchId: seed.id })
        return yield* listSavedSearches({ projectId: PROJECT_ID })
      }).pipe(Effect.provide(layer)),
    )
    expect(page.items).toHaveLength(0)
  })

  it("fails with SavedSearchNotFoundError on a missing id", async () => {
    const layer = makeLayer()
    await expect(
      Effect.runPromise(
        deleteSavedSearch({ savedSearchId: SavedSearchId("9".repeat(24)) }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(SavedSearchNotFoundError)
  })
})
