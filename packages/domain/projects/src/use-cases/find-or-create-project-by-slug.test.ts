import { OutboxEventWriter } from "@domain/events"
import {
  causesIncludePostgresUniqueViolation,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createProject, type Project } from "../entities/project.ts"
import { ProjectRepository } from "../ports/project-repository.ts"
import { createFakeProjectRepository } from "../testing/fake-project-repository.ts"
import { findOrCreateProjectBySlugUseCase } from "./find-or-create-project-by-slug.ts"

const ORG_ID = OrganizationId("o".repeat(24))

const makeProject = (args: { id: ProjectId; slug: string; name: string }): Project =>
  createProject({ organizationId: ORG_ID, id: args.id, slug: args.slug, name: args.name })

const fakeOutbox = Layer.succeed(OutboxEventWriter, { write: () => Effect.void })

function makeLayer(seed: readonly Project[]) {
  const { repository, rows } = createFakeProjectRepository(seed)
  const layer = Layer.mergeAll(
    Layer.succeed(ProjectRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    fakeOutbox,
  )
  return { layer, rows }
}

describe("findOrCreateProjectBySlugUseCase", () => {
  it("returns the existing project when the slug already resolves", async () => {
    const id = ProjectId("1".repeat(24))
    const { layer, rows } = makeLayer([makeProject({ id, slug: "checkout-agent", name: "Checkout agent" })])

    const result = await Effect.runPromise(
      findOrCreateProjectBySlugUseCase({ slug: "checkout-agent" }).pipe(Effect.provide(layer)),
    )

    expect(result.id).toBe(id)
    expect(rows.size).toBe(1)
  })

  it("creates a project using the slug as its name when the slug is unknown", async () => {
    const { layer, rows } = makeLayer([])

    const result = await Effect.runPromise(
      findOrCreateProjectBySlugUseCase({ slug: "fresh-project" }).pipe(Effect.provide(layer)),
    )

    expect(result.slug).toBe("fresh-project")
    expect(result.name).toBe("fresh-project")
    expect(rows.size).toBe(1)
  })

  it("normalizes the slug before lookup and storage", async () => {
    const { layer, rows } = makeLayer([])

    const result = await Effect.runPromise(
      findOrCreateProjectBySlugUseCase({ slug: "My Service" }).pipe(Effect.provide(layer)),
    )

    expect(result.slug).toBe("my-service")
    expect(result.name).toBe("My Service")
    expect(rows.size).toBe(1)
  })

  it("does not create a second project for the same slug (idempotent)", async () => {
    const { layer, rows } = makeLayer([])

    const first = await Effect.runPromise(
      findOrCreateProjectBySlugUseCase({ slug: "repeat" }).pipe(Effect.provide(layer)),
    )
    const second = await Effect.runPromise(
      findOrCreateProjectBySlugUseCase({ slug: "repeat" }).pipe(Effect.provide(layer)),
    )

    expect(second.id).toBe(first.id)
    expect(rows.size).toBe(1)
  })

  it("fails with InvalidProjectSlugError when the slug normalizes to empty", async () => {
    const { layer, rows } = makeLayer([])

    const result = await Effect.runPromise(
      Effect.flip(findOrCreateProjectBySlugUseCase({ slug: "###" }).pipe(Effect.provide(layer))),
    )

    expect(result._tag).toBe("InvalidProjectSlugError")
    expect(rows.size).toBe(0)
  })

  it("re-fetches the winner when a concurrent insert lost the unique-constraint race", async () => {
    // Simulate the race: the first findBySlug misses, the save then fails with a
    // Postgres 23505, and the retry findBySlug now sees the project a concurrent
    // ingest committed. The fake's save would otherwise just succeed, so we wrap it.
    const id = ProjectId("2".repeat(24))
    const winner = makeProject({ id, slug: "raced", name: "raced" })
    const { repository } = createFakeProjectRepository([])

    let findCalls = 0
    const racing = ProjectRepository.of({
      ...repository,
      findBySlug: (slug) =>
        Effect.gen(function* () {
          findCalls++
          // Miss on the first lookup, hit on the retry (concurrent commit landed).
          if (findCalls === 1) return yield* repository.findBySlug(slug)
          return winner
        }),
      save: () => Effect.fail(new RepositoryError({ cause: { code: "23505" }, operation: "insert" })),
    })

    const layer = Layer.mergeAll(
      Layer.succeed(ProjectRepository, racing),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      fakeOutbox,
    )

    const result = await Effect.runPromise(
      findOrCreateProjectBySlugUseCase({ slug: "raced" }).pipe(Effect.provide(layer)),
    )

    expect(result.id).toBe(id)
    expect(causesIncludePostgresUniqueViolation({ code: "23505" })).toBe(true)
  })
})
