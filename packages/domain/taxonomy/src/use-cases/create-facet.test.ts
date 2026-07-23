import { ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { MAX_FACETS_PER_PROJECT } from "../constants.ts"
import { FacetInvalidError, FacetLimitReachedError } from "../errors.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import { createFakeFacetRepository } from "../testing/fake-facet-repository.ts"
import { createFacet } from "./create-facet.ts"

const PROJECT_ID = ProjectId("p".repeat(24))

const makeLayer = () => {
  const { repository, rows } = createFakeFacetRepository()
  const layer = Layer.mergeAll(
    Layer.succeed(FacetRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
  return { layer, rows }
}

const validInput = {
  projectId: PROJECT_ID,
  name: "Apparent user goal",
  description: "What the user is ultimately trying to accomplish.",
  instructions: "In one sentence, what was the user trying to accomplish?",
}

describe("createFacet", () => {
  it("persists a lens definition with a slugified name and does not garden on its own", async () => {
    const { layer, rows } = makeLayer()
    const facet = await Effect.runPromise(createFacet(validInput).pipe(Effect.provide(layer)))

    expect(facet.slug).toBe("apparent-user-goal")
    expect(facet.name).toBe("Apparent user goal")
    expect(facet.instructions).toBe(validInput.instructions)
    expect(rows.get(facet.id)?.slug).toBe("apparent-user-goal")
  })

  it("rejects empty instructions (the write-once extraction target must exist)", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(createFacet({ ...validInput, instructions: "   " }).pipe(Effect.provide(layer))),
    ).rejects.toBeInstanceOf(FacetInvalidError)
  })

  it("enforces the per-project facet cap", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          for (let index = 0; index < MAX_FACETS_PER_PROJECT; index++) {
            yield* createFacet({ ...validInput, name: `Lens ${index}` })
          }
          return yield* createFacet({ ...validInput, name: "One too many" })
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(FacetLimitReachedError)
  })
})
