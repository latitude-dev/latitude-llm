import { ProjectId, SavedSearchId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SavedSearch } from "../entities/saved-search.ts"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"
import { createFakeSavedSearchRepository } from "../testing/fake-saved-search-repository.ts"
import { listSavedSearches } from "./list-saved-searches.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const OTHER_PROJECT_ID = ProjectId("o".repeat(24))
const CREATED_BY = UserId("u".repeat(24))
const ASSIGNEE = UserId("a".repeat(24))

const makeRow = (overrides: Partial<SavedSearch> & Pick<SavedSearch, "id" | "slug" | "createdAt">): SavedSearch => ({
  organizationId: "fake-org".padEnd(24, "0") as SavedSearch["organizationId"],
  projectId: PROJECT_ID,
  name: overrides.slug,
  query: "x",
  filterSet: {},
  assignedUserId: null,
  createdByUserId: CREATED_BY,
  deletedAt: null,
  updatedAt: overrides.createdAt,
  ...overrides,
})

function makeLayer(seed: readonly SavedSearch[]) {
  const { repository } = createFakeSavedSearchRepository(seed)
  return Layer.mergeAll(
    Layer.succeed(SavedSearchRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
}

describe("listSavedSearches", () => {
  it("returns rows for the project ordered by createdAt desc", async () => {
    const seed: SavedSearch[] = [
      makeRow({ id: SavedSearchId("1".repeat(24)), slug: "older", createdAt: new Date("2025-01-01") }),
      makeRow({ id: SavedSearchId("2".repeat(24)), slug: "newer", createdAt: new Date("2025-02-01") }),
    ]
    const result = await Effect.runPromise(
      listSavedSearches({ projectId: PROJECT_ID }).pipe(Effect.provide(makeLayer(seed))),
    )
    expect(result.items.map((row) => row.slug)).toEqual(["newer", "older"])
  })

  it("filters by assignedUserId", async () => {
    const seed: SavedSearch[] = [
      makeRow({
        id: SavedSearchId("1".repeat(24)),
        slug: "mine",
        createdAt: new Date("2025-01-01"),
        assignedUserId: ASSIGNEE,
      }),
      makeRow({
        id: SavedSearchId("2".repeat(24)),
        slug: "theirs",
        createdAt: new Date("2025-01-02"),
      }),
    ]
    const result = await Effect.runPromise(
      listSavedSearches({ projectId: PROJECT_ID, assignedUserId: ASSIGNEE }).pipe(Effect.provide(makeLayer(seed))),
    )
    expect(result.items.map((row) => row.slug)).toEqual(["mine"])
  })

  it("isolates by project", async () => {
    const seed: SavedSearch[] = [
      makeRow({
        id: SavedSearchId("1".repeat(24)),
        slug: "current-project",
        createdAt: new Date("2025-01-01"),
      }),
      makeRow({
        id: SavedSearchId("2".repeat(24)),
        slug: "other-project",
        createdAt: new Date("2025-01-02"),
        projectId: OTHER_PROJECT_ID,
      }),
    ]
    const result = await Effect.runPromise(
      listSavedSearches({ projectId: PROJECT_ID }).pipe(Effect.provide(makeLayer(seed))),
    )
    expect(result.items.map((row) => row.slug)).toEqual(["current-project"])
  })
})
