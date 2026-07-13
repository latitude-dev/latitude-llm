import { CustomBehaviorId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { MAX_CUSTOM_BEHAVIORS_PER_PROJECT } from "../constants.ts"
import { CustomBehaviorStatus } from "../entities/custom-behavior.ts"
import {
  CustomBehaviorFilterInvalidError,
  CustomBehaviorLimitReachedError,
  CustomBehaviorNameInvalidError,
} from "../errors.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"
import { createFakeCustomBehaviorRepository } from "../testing/fake-custom-behavior-repository.ts"
import { createCustomBehavior } from "./create-custom-behavior.ts"
import { deleteCustomBehavior } from "./delete-custom-behavior.ts"
import { updateCustomBehavior } from "./update-custom-behavior.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const OTHER_PROJECT_ID = ProjectId("q".repeat(24))

function makeLayer() {
  const { repository, rows } = createFakeCustomBehaviorRepository()
  const layer = Layer.mergeAll(
    Layer.succeed(CustomBehaviorRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
  return { layer, rows }
}

describe("createCustomBehavior", () => {
  it("creates a behavior with a slugified name and pending status", async () => {
    const { layer } = makeLayer()
    const result = await Effect.runPromise(
      createCustomBehavior({
        projectId: PROJECT_ID,
        name: "Refund Requests",
        filterSet: { moments: [{ op: "in", value: ["escalation"] }] },
      }).pipe(Effect.provide(layer)),
    )
    expect(result.slug).toBe("refund-requests")
    expect(result.name).toBe("Refund Requests")
    expect(result.status).toBe(CustomBehaviorStatus.Pending)
  })

  it("appends a random suffix on slug collision within the project", async () => {
    const { layer } = makeLayer()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: {} })
        return yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: {} })
      }).pipe(Effect.provide(layer)),
    )
    expect(result.slug).toMatch(/^refunds-[a-z0-9]{4}$/)
  })

  it("rejects a filter set containing topics", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        createCustomBehavior({
          projectId: PROJECT_ID,
          name: "Circular",
          filterSet: { topics: [{ op: "in", value: ["support"] }] },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorFilterInvalidError)
  })

  it("rejects an empty name", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        createCustomBehavior({ projectId: PROJECT_ID, name: "   ", filterSet: {} }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorNameInvalidError)
  })

  it("rejects an 11th behavior once the project cap is reached", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          for (let i = 0; i < MAX_CUSTOM_BEHAVIORS_PER_PROJECT; i++) {
            yield* createCustomBehavior({ projectId: PROJECT_ID, name: `Behavior ${i}`, filterSet: {} })
          }
          return yield* createCustomBehavior({ projectId: PROJECT_ID, name: "One too many", filterSet: {} })
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorLimitReachedError)
  })

  it("counts the cap per project, so a different project can still create", async () => {
    const { layer } = makeLayer()
    const created = await Effect.runPromise(
      Effect.gen(function* () {
        for (let i = 0; i < MAX_CUSTOM_BEHAVIORS_PER_PROJECT; i++) {
          yield* createCustomBehavior({ projectId: PROJECT_ID, name: `Behavior ${i}`, filterSet: {} })
        }
        return yield* createCustomBehavior({ projectId: OTHER_PROJECT_ID, name: "Fresh project", filterSet: {} })
      }).pipe(Effect.provide(layer)),
    )
    expect(created.projectId).toBe(OTHER_PROJECT_ID)
  })
})

describe("updateCustomBehavior", () => {
  it("renames and regenerates the slug", async () => {
    const { layer } = makeLayer()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: {} })
        return yield* updateCustomBehavior({ id: created.id, name: "Chargebacks" })
      }).pipe(Effect.provide(layer)),
    )
    expect(result.name).toBe("Chargebacks")
    expect(result.slug).toBe("chargebacks")
  })

  it("rejects a filter set containing topics on update", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: {} })
          return yield* updateCustomBehavior({
            id: created.id,
            filterSet: { topics: [{ op: "in", value: ["support"] }] },
          })
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(CustomBehaviorFilterInvalidError)
  })
})

describe("deleteCustomBehavior", () => {
  it("deletes a behavior so it is no longer listed (reads go straight through the repository)", async () => {
    const { layer } = makeLayer()
    const listed = await Effect.runPromise(
      Effect.gen(function* () {
        const created = yield* createCustomBehavior({ projectId: PROJECT_ID, name: "Refunds", filterSet: {} })
        yield* deleteCustomBehavior({ id: created.id })
        const repo = yield* CustomBehaviorRepository
        return yield* repo.listByProject({ projectId: PROJECT_ID })
      }).pipe(Effect.provide(layer)),
    )
    expect(listed).toHaveLength(0)
  })

  it("fails to delete a missing behavior with NotFoundError", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(deleteCustomBehavior({ id: CustomBehaviorId("z".repeat(24)) }).pipe(Effect.provide(layer))),
    ).rejects.toThrow()
  })
})
