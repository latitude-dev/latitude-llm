import { ProjectId, SavedSearchId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { SavedSearch } from "../entities/saved-search.ts"
import { EmptySavedSearchError, InvalidSavedSearchNameError } from "../errors.ts"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"
import { createFakeSavedSearchRepository } from "../testing/fake-saved-search-repository.ts"
import { updateSavedSearch } from "./update-saved-search.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const CREATED_BY = UserId("u".repeat(24))
const ASSIGNEE = UserId("a".repeat(24))

const baseRow = (overrides: Partial<SavedSearch> & Pick<SavedSearch, "id" | "slug" | "name">): SavedSearch => ({
  organizationId: "fake-org".padEnd(24, "0") as SavedSearch["organizationId"],
  projectId: PROJECT_ID,
  query: "fail",
  filterSet: {},
  assignedUserId: null,
  createdByUserId: CREATED_BY,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

function makeLayer(seed: readonly SavedSearch[]) {
  const { repository } = createFakeSavedSearchRepository(seed)
  return Layer.mergeAll(
    Layer.succeed(SavedSearchRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
}

describe("updateSavedSearch", () => {
  it("regenerates the slug when the name changes to a different slug", async () => {
    const id = SavedSearchId("1".repeat(24))
    const layer = makeLayer([baseRow({ id, slug: "errors", name: "Errors" })])
    const result = await Effect.runPromise(updateSavedSearch({ id, name: "Failures" }).pipe(Effect.provide(layer)))
    expect(result.name).toBe("Failures")
    expect(result.slug).toBe("failures")
  })

  it("keeps the existing slug when toSlug(name) matches the current slug", async () => {
    const id = SavedSearchId("1".repeat(24))
    const layer = makeLayer([baseRow({ id, slug: "errors", name: "Errors" })])
    const result = await Effect.runPromise(updateSavedSearch({ id, name: "errors" }).pipe(Effect.provide(layer)))
    expect(result.slug).toBe("errors")
    expect(result.name).toBe("errors")
  })

  it("appends a numeric suffix when the new slug collides with another row", async () => {
    const id = SavedSearchId("1".repeat(24))
    const otherId = SavedSearchId("2".repeat(24))
    const layer = makeLayer([
      baseRow({ id, slug: "errors", name: "Errors" }),
      baseRow({ id: otherId, slug: "failures", name: "Failures" }),
    ])
    const result = await Effect.runPromise(updateSavedSearch({ id, name: "Failures" }).pipe(Effect.provide(layer)))
    expect(result.slug).toBe("failures-1")
  })

  it("updates the query when only query changes", async () => {
    const id = SavedSearchId("1".repeat(24))
    const layer = makeLayer([baseRow({ id, slug: "errors", name: "Errors", query: "old" })])
    const result = await Effect.runPromise(updateSavedSearch({ id, query: "new" }).pipe(Effect.provide(layer)))
    expect(result.query).toBe("new")
    expect(result.name).toBe("Errors")
    expect(result.slug).toBe("errors")
  })

  it("updates the filterSet when only filterSet changes", async () => {
    const id = SavedSearchId("1".repeat(24))
    const layer = makeLayer([baseRow({ id, slug: "errors", name: "Errors" })])
    const result = await Effect.runPromise(
      updateSavedSearch({ id, filterSet: { status: [{ op: "eq", value: "error" }] } }).pipe(Effect.provide(layer)),
    )
    expect(result.filterSet).toEqual({ status: [{ op: "eq", value: "error" }] })
  })

  it("allows clearing query when filterSet remains non-empty", async () => {
    const id = SavedSearchId("1".repeat(24))
    const layer = makeLayer([
      baseRow({
        id,
        slug: "errors",
        name: "Errors",
        query: "old",
        filterSet: { status: [{ op: "eq", value: "error" }] },
      }),
    ])
    const result = await Effect.runPromise(updateSavedSearch({ id, query: null }).pipe(Effect.provide(layer)))
    expect(result.query).toBeNull()
  })

  it("rejects clearing both query and filterSet", async () => {
    const id = SavedSearchId("1".repeat(24))
    const layer = makeLayer([
      baseRow({
        id,
        slug: "errors",
        name: "Errors",
        query: "old",
        filterSet: { status: [{ op: "eq", value: "error" }] },
      }),
    ])
    await expect(
      Effect.runPromise(updateSavedSearch({ id, query: null, filterSet: {} }).pipe(Effect.provide(layer))),
    ).rejects.toBeInstanceOf(EmptySavedSearchError)
  })

  it("assigns and unassigns a user", async () => {
    const id = SavedSearchId("1".repeat(24))
    const layer = makeLayer([baseRow({ id, slug: "errors", name: "Errors" })])
    const assigned = await Effect.runPromise(
      updateSavedSearch({ id, assignedUserId: ASSIGNEE }).pipe(Effect.provide(layer)),
    )
    expect(assigned.assignedUserId).toBe(ASSIGNEE)
    const unassigned = await Effect.runPromise(
      updateSavedSearch({ id, assignedUserId: null }).pipe(Effect.provide(layer)),
    )
    expect(unassigned.assignedUserId).toBeNull()
  })

  it("rejects an empty name", async () => {
    const id = SavedSearchId("1".repeat(24))
    const layer = makeLayer([baseRow({ id, slug: "errors", name: "Errors" })])
    await expect(
      Effect.runPromise(updateSavedSearch({ id, name: "   " }).pipe(Effect.provide(layer))),
    ).rejects.toBeInstanceOf(InvalidSavedSearchNameError)
  })
})
