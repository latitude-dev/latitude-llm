import { ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { FacetInvalidError } from "../errors.ts"
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
  it("persists a facet definition with a slugified name and does not garden on its own", async () => {
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

  it("does not cap the number of facet definitions per project", async () => {
    const { layer, rows } = makeLayer()
    await Effect.runPromise(
      Effect.gen(function* () {
        for (let index = 0; index < 15; index++) {
          yield* createFacet({ ...validInput, name: `Facet ${index}` })
        }
      }).pipe(Effect.provide(layer)),
    )
    expect(rows.size).toBe(15)
  })

  it("rejects a name that slugifies into the reserved lat- preset namespace", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(createFacet({ ...validInput, name: "Lat something" }).pipe(Effect.provide(layer))),
    ).rejects.toBeInstanceOf(FacetInvalidError)
  })
})
