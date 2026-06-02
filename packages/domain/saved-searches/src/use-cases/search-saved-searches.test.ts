import { ProjectId, SavedSearchId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SavedSearch } from "../entities/saved-search.ts"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"
import { createFakeSavedSearchRepository } from "../testing/fake-saved-search-repository.ts"
import { searchSavedSearches } from "./search-saved-searches.ts"

const PROJECT_A = ProjectId("a".repeat(24))
const PROJECT_B = ProjectId("b".repeat(24))
const CREATED_BY = UserId("u".repeat(24))

const makeRow = (
  overrides: Partial<SavedSearch> & Pick<SavedSearch, "id" | "slug" | "name" | "createdAt">,
): SavedSearch => ({
  organizationId: "fake-org".padEnd(24, "0") as SavedSearch["organizationId"],
  projectId: PROJECT_A,
  query: "x",
  filterSet: {},
  assignedUserId: null,
  createdByUserId: CREATED_BY,
  deletedAt: null,
  updatedAt: overrides.createdAt,
  ...overrides,
})

const run = (seed: readonly SavedSearch[], args: { readonly searchQuery?: string; readonly limit?: number }) => {
  const { repository } = createFakeSavedSearchRepository(seed)
  return Effect.runPromise(
    searchSavedSearches(args).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(SavedSearchRepository, repository),
          Layer.succeed(SqlClient, createFakeSqlClient()),
        ),
      ),
    ),
  )
}

describe("searchSavedSearches", () => {
  const seed = [
    makeRow({
      id: SavedSearchId("1".repeat(24)),
      slug: "errors-a",
      name: "Errors",
      createdAt: new Date("2025-01-01"),
      projectId: PROJECT_A,
    }),
    makeRow({
      id: SavedSearchId("2".repeat(24)),
      slug: "errors-b",
      name: "Error spikes",
      createdAt: new Date("2025-02-01"),
      projectId: PROJECT_B,
    }),
    makeRow({
      id: SavedSearchId("3".repeat(24)),
      slug: "latency",
      name: "Latency",
      createdAt: new Date("2025-03-01"),
      projectId: PROJECT_A,
    }),
  ]

  it("returns matching saved searches across multiple projects in the org", async () => {
    const results = await run(seed, { searchQuery: "error" })
    expect(results.map((r) => r.name).sort()).toEqual(["Error spikes", "Errors"])
    expect(new Set(results.map((r) => r.projectId)).size).toBe(2)
  })

  it("carries owning project display fields", async () => {
    const results = await run(seed, { searchQuery: "latency" })
    expect(results).toHaveLength(1)
    expect(results[0]?.projectId).toBe(PROJECT_A)
    expect(results[0]?.projectSlug).toContain(PROJECT_A)
    expect(results[0]?.projectName).toContain(PROJECT_A)
  })

  it("respects the limit", async () => {
    const results = await run(seed, { searchQuery: "error", limit: 1 })
    expect(results).toHaveLength(1)
  })
})
