import { createProjectUseCase, ProjectRepository } from "@domain/projects"
import { OrganizationId } from "@domain/shared"
import { silenceLoggerInTests } from "@repo/vitest-config/silence-logger"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { OutboxEventWriterLive } from "../outbox-writer.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { ProjectRepositoryLive } from "./project-repository.ts"

silenceLoggerInTests()

// Locks the slug-stability invariant the onboarding cleanup relies on (delete + recreate with the same
// name → same slug): `countBySlug` ignores soft-deleted rows and the unique index is
// `(organization_id, slug, deleted_at)` with `nullsNotDistinct()`, so a live row coexists with the soft-deleted one.
const pg = setupTestPostgres()

const provide = (organizationId: string) => {
  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      withPostgres(
        Layer.mergeAll(ProjectRepositoryLive, OutboxEventWriterLive),
        pg.appPostgresClient,
        OrganizationId(organizationId),
      ),
    )
}

describe("project slug stability across delete + recreate", () => {
  it("recreating a soft-deleted project with the same name reuses the slug", async () => {
    const organizationId = "s".repeat(24)

    const first = await Effect.runPromise(createProjectUseCase({ name: "My Project" }).pipe(provide(organizationId)))
    expect(first.slug).toBe("my-project")

    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* ProjectRepository
        yield* repo.softDelete(first.id)
      }).pipe(provide(organizationId)),
    )

    const recreated = await Effect.runPromise(
      createProjectUseCase({ name: "My Project" }).pipe(provide(organizationId)),
    )

    expect(recreated.slug).toBe("my-project")
    expect(recreated.id).not.toBe(first.id)
  })

  it("still suffixes the slug when a same-named project is live (not deleted)", async () => {
    const organizationId = "t".repeat(24)

    const first = await Effect.runPromise(createProjectUseCase({ name: "My Project" }).pipe(provide(organizationId)))
    expect(first.slug).toBe("my-project")

    const second = await Effect.runPromise(createProjectUseCase({ name: "My Project" }).pipe(provide(organizationId)))
    expect(second.slug).not.toBe("my-project")
    expect(second.slug).toMatch(/^my-project-/)
  })
})
