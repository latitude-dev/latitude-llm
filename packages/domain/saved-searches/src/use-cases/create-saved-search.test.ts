import { ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { EmptySavedSearchError, InvalidSavedSearchNameError } from "../errors.ts"
import { SavedSearchRepository } from "../ports/saved-search-repository.ts"
import { createFakeSavedSearchRepository } from "../testing/fake-saved-search-repository.ts"
import { createSavedSearch } from "./create-saved-search.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const CREATED_BY = UserId("u".repeat(24))

function makeLayer() {
  const { repository } = createFakeSavedSearchRepository()
  return Layer.mergeAll(
    Layer.succeed(SavedSearchRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
}

describe("createSavedSearch", () => {
  it("creates a saved search with a slugified name", async () => {
    const layer = makeLayer()
    const result = await Effect.runPromise(
      createSavedSearch({
        projectId: PROJECT_ID,
        name: "Failed Payments",
        query: "failed payments",
        filterSet: { status: [{ op: "eq", value: "error" }] },
        createdByUserId: CREATED_BY,
      }).pipe(Effect.provide(layer)),
    )
    expect(result.slug).toBe("failed-payments")
    expect(result.name).toBe("Failed Payments")
    expect(result.query).toBe("failed payments")
    expect(result.assignedUserId).toBeNull()
  })

  it("appends a numeric suffix on slug collision", async () => {
    const layer = makeLayer()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createSavedSearch({
          projectId: PROJECT_ID,
          name: "Errors",
          query: "fail",
          filterSet: {},
          createdByUserId: CREATED_BY,
        })
        return yield* createSavedSearch({
          projectId: PROJECT_ID,
          name: "Errors",
          query: "fail again",
          filterSet: {},
          createdByUserId: CREATED_BY,
        })
      }).pipe(Effect.provide(layer)),
    )
    expect(result.slug).toBe("errors-1")
  })

  it("rejects an empty search (no query and no filters)", async () => {
    const layer = makeLayer()
    await expect(
      Effect.runPromise(
        createSavedSearch({
          projectId: PROJECT_ID,
          name: "Empty",
          query: null,
          filterSet: {},
          createdByUserId: CREATED_BY,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(EmptySavedSearchError)
  })

  it("rejects an empty name", async () => {
    const layer = makeLayer()
    await expect(
      Effect.runPromise(
        createSavedSearch({
          projectId: PROJECT_ID,
          name: "   ",
          query: "x",
          filterSet: {},
          createdByUserId: CREATED_BY,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(InvalidSavedSearchNameError)
  })

  it("rejects a too-long name", async () => {
    const layer = makeLayer()
    await expect(
      Effect.runPromise(
        createSavedSearch({
          projectId: PROJECT_ID,
          name: "a".repeat(257),
          query: "x",
          filterSet: {},
          createdByUserId: CREATED_BY,
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(InvalidSavedSearchNameError)
  })

  it("treats a whitespace-only query as null and accepts when filters are present", async () => {
    const layer = makeLayer()
    const result = await Effect.runPromise(
      createSavedSearch({
        projectId: PROJECT_ID,
        name: "Filtered",
        query: "   ",
        filterSet: { status: [{ op: "eq", value: "error" }] },
        createdByUserId: CREATED_BY,
      }).pipe(Effect.provide(layer)),
    )
    expect(result.query).toBeNull()
  })
})
