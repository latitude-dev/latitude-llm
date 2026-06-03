import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createProject, type Project } from "../entities/project.ts"
import { ProjectRepository } from "../ports/project-repository.ts"
import { createFakeProjectRepository } from "../testing/fake-project-repository.ts"
import { updateProjectUseCase } from "./update-project.ts"

const ORG_ID = OrganizationId("o".repeat(24))

const makeProject = (args: { id: ProjectId; slug: string; name: string }): Project =>
  createProject({ organizationId: ORG_ID, id: args.id, slug: args.slug, name: args.name })

function makeLayer(seed: readonly Project[]) {
  const { repository, rows } = createFakeProjectRepository(seed)
  const layer = Layer.mergeAll(
    Layer.succeed(ProjectRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient()),
  )
  return { layer, rows }
}

describe("updateProjectUseCase", () => {
  it("keeps the slug unchanged when the project is renamed (slug is decoupled from name)", async () => {
    const id = ProjectId("1".repeat(24))
    const { layer, rows } = makeLayer([makeProject({ id, slug: "checkout-agent", name: "Checkout agent" })])

    const result = await Effect.runPromise(
      updateProjectUseCase({ id, name: "Billing agent" }).pipe(Effect.provide(layer)),
    )

    expect(result.name).toBe("Billing agent")
    expect(result.slug).toBe("checkout-agent")
    expect(rows.get(id)?.slug).toBe("checkout-agent")
  })

  it("changes the slug when an explicit slug is provided", async () => {
    const id = ProjectId("1".repeat(24))
    const { layer, rows } = makeLayer([makeProject({ id, slug: "checkout-agent", name: "Checkout agent" })])

    const result = await Effect.runPromise(
      updateProjectUseCase({ id, slug: "billing-agent" }).pipe(Effect.provide(layer)),
    )

    expect(result.slug).toBe("billing-agent")
    expect(result.name).toBe("Checkout agent")
    expect(rows.get(id)?.slug).toBe("billing-agent")
  })

  it("normalizes the requested slug into a URL-safe form", async () => {
    const id = ProjectId("1".repeat(24))
    const { layer } = makeLayer([makeProject({ id, slug: "checkout-agent", name: "Checkout agent" })])

    const result = await Effect.runPromise(
      updateProjectUseCase({ id, slug: "Billing Agent!!" }).pipe(Effect.provide(layer)),
    )

    expect(result.slug).toBe("billing-agent")
  })

  it("rejects a slug that already belongs to another project in the org", async () => {
    const id = ProjectId("1".repeat(24))
    const otherId = ProjectId("2".repeat(24))
    const { layer } = makeLayer([
      makeProject({ id, slug: "checkout-agent", name: "Checkout agent" }),
      makeProject({ id: otherId, slug: "billing-agent", name: "Billing agent" }),
    ])

    const error = await Effect.runPromise(
      updateProjectUseCase({ id, slug: "billing-agent" }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("InvalidProjectSlugError")
  })

  it("rejects a slug with no URL-safe characters", async () => {
    const id = ProjectId("1".repeat(24))
    const { layer } = makeLayer([makeProject({ id, slug: "checkout-agent", name: "Checkout agent" })])

    const error = await Effect.runPromise(
      updateProjectUseCase({ id, slug: "!!!" }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("InvalidProjectSlugError")
  })

  it("is a no-op on the slug when the requested slug equals the current slug", async () => {
    const id = ProjectId("1".repeat(24))
    const { layer, rows } = makeLayer([makeProject({ id, slug: "checkout-agent", name: "Checkout agent" })])

    const result = await Effect.runPromise(
      updateProjectUseCase({ id, slug: "checkout-agent" }).pipe(Effect.provide(layer)),
    )

    expect(result.slug).toBe("checkout-agent")
    expect(rows.get(id)?.slug).toBe("checkout-agent")
  })
})
