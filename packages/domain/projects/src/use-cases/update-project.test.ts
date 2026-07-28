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

  it("rejects a reserved slug typed by the user", async () => {
    const id = ProjectId("1".repeat(24))
    const { layer, rows } = makeLayer([makeProject({ id, slug: "checkout-agent", name: "Checkout agent" })])

    const error = await Effect.runPromise(
      updateProjectUseCase({ id, slug: "Lat Demo" }).pipe(Effect.provide(layer), Effect.flip),
    )

    expect(error._tag).toBe("InvalidProjectSlugError")
    expect(rows.get(id)?.slug).toBe("checkout-agent")
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

  describe("settings", () => {
    const seeded = (id: ProjectId): Project => ({
      ...makeProject({ id, slug: "checkout-agent", name: "Checkout agent" }),
      settings: {
        redaction: { mode: "enforce", entities: ["email"] },
        sampling: { enabled: true, rate: 0.5 },
        isShowcase: true,
      },
    })

    it("merges settingsPatch over the stored settings, keeping keys the caller omitted", async () => {
      const id = ProjectId("1".repeat(24))
      const { layer, rows } = makeLayer([seeded(id)])

      const result = await Effect.runPromise(
        updateProjectUseCase({ id, settingsPatch: { keepMonitoring: false } }).pipe(Effect.provide(layer)),
      )

      expect(result.settings).toEqual({
        keepMonitoring: false,
        redaction: { mode: "enforce", entities: ["email"] },
        sampling: { enabled: true, rate: 0.5 },
        isShowcase: true,
      })
      expect(rows.get(id)?.settings?.redaction).toEqual({ mode: "enforce", entities: ["email"] })
    })

    // The web client narrows `settings` to the fields it renders, so a patch carrying
    // `sampling` must not take `redaction` with it. This is the shape of T-11.
    it("preserves redaction when a client patches only the fields it knows about", async () => {
      const id = ProjectId("1".repeat(24))
      const { layer, rows } = makeLayer([seeded(id)])

      await Effect.runPromise(
        updateProjectUseCase({
          id,
          settingsPatch: { keepMonitoring: true, sampling: { enabled: false, rate: 1 } },
        }).pipe(Effect.provide(layer)),
      )

      expect(rows.get(id)?.settings?.redaction).toEqual({ mode: "enforce", entities: ["email"] })
      expect(rows.get(id)?.settings?.isShowcase).toBe(true)
      expect(rows.get(id)?.settings?.sampling).toEqual({ enabled: false, rate: 1 })
    })

    it("replaces wholesale when given settings, so a caller can still clear keys", async () => {
      const id = ProjectId("1".repeat(24))
      const { layer, rows } = makeLayer([seeded(id)])

      await Effect.runPromise(
        updateProjectUseCase({ id, settings: { keepMonitoring: false } }).pipe(Effect.provide(layer)),
      )

      expect(rows.get(id)?.settings).toEqual({ keepMonitoring: false })
    })

    it("leaves settings untouched when neither field is given", async () => {
      const id = ProjectId("1".repeat(24))
      const { layer, rows } = makeLayer([seeded(id)])

      await Effect.runPromise(updateProjectUseCase({ id, name: "Billing agent" }).pipe(Effect.provide(layer)))

      expect(rows.get(id)?.settings).toEqual(seeded(id).settings)
    })
  })
})
