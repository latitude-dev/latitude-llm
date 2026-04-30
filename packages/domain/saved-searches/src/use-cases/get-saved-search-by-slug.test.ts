import { ProjectId, SavedSearchId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SavedSearch } from "../entities/saved-search.ts"
import { SavedSearchNotFoundError } from "../errors.ts"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"
import { createFakeSavedSearchRepository } from "../testing/fake-saved-search-repository.ts"
import { getSavedSearchBySlug } from "./get-saved-search-by-slug.ts"

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

describe("getSavedSearchBySlug", () => {
  it("returns the row by slug", async () => {
    const result = await Effect.runPromise(
      getSavedSearchBySlug({ projectId: PROJECT_ID, slug: "errors" }).pipe(Effect.provide(makeLayer())),
    )
    expect(result.id).toBe(seed.id)
  })

  it("fails with SavedSearchNotFoundError when missing", async () => {
    await expect(
      Effect.runPromise(
        getSavedSearchBySlug({ projectId: PROJECT_ID, slug: "missing" }).pipe(Effect.provide(makeLayer())),
      ),
    ).rejects.toBeInstanceOf(SavedSearchNotFoundError)
  })
})
