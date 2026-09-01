import { QueuePublisher } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { customBehaviorFilterSetHasConditions } from "../entities/custom-behavior.ts"
import { FACET_PRESETS } from "../entities/facet-preset.ts"
import { CustomBehaviorRepository } from "../ports/custom-behavior-repository.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import { createFakeCustomBehaviorRepository } from "../testing/fake-custom-behavior-repository.ts"
import { createFakeFacetRepository } from "../testing/fake-facet-repository.ts"
import { createFacetBehavior } from "./create-facet-behavior.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const USER_GOAL_SLUG = FACET_PRESETS[0]?.slug ?? "lat-user-goal"

const makeLayer = () => {
  const behaviors = createFakeCustomBehaviorRepository()
  const facets = createFakeFacetRepository()
  const layer = Layer.mergeAll(
    Layer.succeed(CustomBehaviorRepository, behaviors.repository),
    Layer.succeed(FacetRepository, facets.repository),
    Layer.succeed(QueuePublisher, createFakeQueuePublisher().publisher),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
  return { layer, behaviorRows: behaviors.rows, facetRows: facets.rows }
}

describe("createFacetBehavior", () => {
  it("materializes a preset as its whole-project view (empty filter, facet set) and creates the facet", async () => {
    const { layer, facetRows } = makeLayer()
    const view = await Effect.runPromise(
      createFacetBehavior({
        projectId: PROJECT_ID,
        facetSelection: { kind: "preset", presetSlug: USER_GOAL_SLUG },
      }).pipe(Effect.provide(layer)),
    )
    expect(view.facetId).not.toBeNull()
    expect(customBehaviorFilterSetHasConditions(view.filterSet)).toBe(false)
    expect([...facetRows.values()][0]?.slug).toBe(USER_GOAL_SLUG)
  })

  it("reuses the existing whole-project view when the same preset is picked again", async () => {
    const { layer, behaviorRows } = makeLayer()
    const [first, second] = await Effect.runPromise(
      Effect.gen(function* () {
        const a = yield* createFacetBehavior({
          projectId: PROJECT_ID,
          facetSelection: { kind: "preset", presetSlug: USER_GOAL_SLUG },
        })
        const b = yield* createFacetBehavior({
          projectId: PROJECT_ID,
          facetSelection: { kind: "preset", presetSlug: USER_GOAL_SLUG },
        })
        return [a, b] as const
      }).pipe(Effect.provide(layer)),
    )
    expect(second.id).toBe(first.id)
    expect(behaviorRows.size).toBe(1)
  })

  it("creates an inline custom facet and its whole-project view", async () => {
    const { layer, facetRows } = makeLayer()
    const view = await Effect.runPromise(
      createFacetBehavior({
        projectId: PROJECT_ID,
        facetSelection: {
          kind: "newFacet",
          newFacet: {
            name: "Payment method",
            description: "Cluster sessions by the payment method the user asked about.",
            instructions: "Which payment method did the user ask about?",
          },
        },
      }).pipe(Effect.provide(layer)),
    )
    expect(view.name).toBe("Payment method")
    expect(customBehaviorFilterSetHasConditions(view.filterSet)).toBe(false)
    expect([...facetRows.values()][0]?.slug).toBe("payment-method")
  })
})
