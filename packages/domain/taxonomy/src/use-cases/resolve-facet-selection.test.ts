import { FacetId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { FACET_PRESET_SLUG_PREFIX } from "../constants.ts"
import type { TaxonomyFacet } from "../entities/facet.ts"
import { FACET_PRESETS } from "../entities/facet-preset.ts"
import { FacetInvalidError } from "../errors.ts"
import { FacetRepository } from "../ports/facet-repository.ts"
import { createFakeFacetRepository } from "../testing/fake-facet-repository.ts"
import { resolveFacetSelection } from "./resolve-facet-selection.ts"

const PROJECT_ID = ProjectId("p".repeat(24))
const USER_GOAL = FACET_PRESETS[0] ?? { slug: "lat-user-goal", name: "User goal", description: "", instructions: "" }

const makeLayer = (seed: readonly TaxonomyFacet[] = []) => {
  const { repository, rows } = createFakeFacetRepository(seed)
  const layer = Layer.mergeAll(
    Layer.succeed(FacetRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
  return { layer, rows }
}

describe("resolveFacetSelection", () => {
  it("resolves the topic selection to null (no facet)", async () => {
    const { layer } = makeLayer()
    const facetId = await Effect.runPromise(
      resolveFacetSelection({ projectId: PROJECT_ID, facetSelection: { kind: "topic" } }).pipe(Effect.provide(layer)),
    )
    expect(facetId).toBeNull()
  })

  it("returns an existing facet id unchanged for the facet selection", async () => {
    const id = FacetId("f".repeat(24))
    const { layer } = makeLayer()
    const facetId = await Effect.runPromise(
      resolveFacetSelection({ projectId: PROJECT_ID, facetSelection: { kind: "facet", facetId: id } }).pipe(
        Effect.provide(layer),
      ),
    )
    expect(facetId).toBe(id)
  })

  it("find-or-creates a preset facet under its reserved slug and reuses it on the second pick", async () => {
    const { layer, rows } = makeLayer()
    const [first, second] = await Effect.runPromise(
      Effect.gen(function* () {
        const a = yield* resolveFacetSelection({
          projectId: PROJECT_ID,
          facetSelection: { kind: "preset", presetSlug: USER_GOAL.slug },
        })
        const b = yield* resolveFacetSelection({
          projectId: PROJECT_ID,
          facetSelection: { kind: "preset", presetSlug: USER_GOAL.slug },
        })
        return [a, b] as const
      }).pipe(Effect.provide(layer)),
    )
    expect(first).toBe(second)
    expect(rows.size).toBe(1)
    expect([...rows.values()][0]?.slug).toBe(USER_GOAL.slug)
  })

  it("rejects an unknown preset slug", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        resolveFacetSelection({
          projectId: PROJECT_ID,
          facetSelection: { kind: "preset", presetSlug: "made-up" },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(FacetInvalidError)
  })

  it("creates an inline user-authored facet for a newFacet", async () => {
    const { layer, rows } = makeLayer()
    const facetId = await Effect.runPromise(
      resolveFacetSelection({
        projectId: PROJECT_ID,
        facetSelection: {
          kind: "newFacet",
          newFacet: {
            name: "Payment method",
            description: "Cluster by the payment method the user asked about.",
            instructions: "Which payment method did the user ask about?",
          },
        },
      }).pipe(Effect.provide(layer)),
    )
    expect(facetId).not.toBeNull()
    expect(rows.get(facetId as FacetId)?.slug).toBe("payment-method")
  })

  it("rejects a newFacet whose name lands in the reserved lat- namespace", async () => {
    const { layer } = makeLayer()
    await expect(
      Effect.runPromise(
        resolveFacetSelection({
          projectId: PROJECT_ID,
          facetSelection: {
            kind: "newFacet",
            newFacet: {
              name: `${FACET_PRESET_SLUG_PREFIX}sneaky`,
              description: "Trying to shadow a preset.",
              instructions: "Anything.",
            },
          },
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toBeInstanceOf(FacetInvalidError)
  })
})
