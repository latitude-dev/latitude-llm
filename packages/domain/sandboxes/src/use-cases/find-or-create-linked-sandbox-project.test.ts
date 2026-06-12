import { OutboxEventWriter } from "@domain/events"
import { createProject, type Project, ProjectRepository } from "@domain/projects"
import { createFakeProjectRepository } from "@domain/projects/testing"
import { generateId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { findOrCreateLinkedSandboxProjectUseCase } from "./find-or-create-linked-sandbox-project.ts"

const SANDBOX_ORG_ID = OrganizationId(generateId())
const LIVE_PROJECT_ID = ProjectId(generateId())
const ACTOR_USER_ID = UserId(generateId())

const buildLayer = (seed: readonly Project[] = []) => {
  const projects = createFakeProjectRepository(seed)
  const layer = Layer.mergeAll(
    Layer.succeed(ProjectRepository, projects.repository),
    Layer.succeed(OutboxEventWriter, { write: () => Effect.void }),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: SANDBOX_ORG_ID })),
  )
  return { layer, projects }
}

const input = {
  sandboxOrganizationId: SANDBOX_ORG_ID,
  liveProjectId: LIVE_PROJECT_ID,
  liveProjectName: "Checkout",
  actorUserId: ACTOR_USER_ID,
}

describe("findOrCreateLinkedSandboxProject (unit)", () => {
  it("returns the existing linked project without creating another", async () => {
    const existing = createProject({
      organizationId: SANDBOX_ORG_ID,
      name: "Checkout",
      slug: "checkout",
      linkedProjectId: LIVE_PROJECT_ID,
    })
    const { layer, projects } = buildLayer([existing])

    const result = await Effect.runPromise(findOrCreateLinkedSandboxProjectUseCase(input).pipe(Effect.provide(layer)))

    expect(result.id).toBe(existing.id)
    expect(projects.rows.size).toBe(1)
  })

  it("creates a linked project from the live project's name on first entry", async () => {
    const { layer, projects } = buildLayer()

    const result = await Effect.runPromise(findOrCreateLinkedSandboxProjectUseCase(input).pipe(Effect.provide(layer)))

    expect(result.name).toBe("Checkout")
    expect(result.linkedProjectId).toBe(LIVE_PROJECT_ID)
    expect(projects.rows.size).toBe(1)
  })

  it("dies when run outside the sandbox org scope", async () => {
    const { layer } = buildLayer()

    const exit = await Effect.runPromiseExit(
      findOrCreateLinkedSandboxProjectUseCase({
        ...input,
        sandboxOrganizationId: OrganizationId(generateId()),
      }).pipe(Effect.provide(layer)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })
})
