import { AdminProjectRepository } from "@domain/admin"
import { ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { organizations } from "../schema/better-auth.ts"
import { projects } from "../schema/projects.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { AdminProjectRepositoryLive } from "./admin-project-repository.ts"

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, AdminProjectRepository>) =>
  Effect.runPromise(effect.pipe(withPostgres(AdminProjectRepositoryLive, pg.adminPostgresClient)))

const makeId = (prefix: string): string => prefix.padEnd(24, "x").slice(0, 24)

const ORG = makeId("org-pr-target")
const ALIVE = makeId("proj-pr-alive")
const DELETED = makeId("proj-pr-deleted")

describe("AdminProjectRepositoryLive.findById", () => {
  beforeAll(async () => {
    const baseTime = new Date("2025-06-01T12:00:00.000Z")

    await pg.db.insert(organizations).values([
      { id: ORG, name: "Project Co", slug: "project-co", createdAt: baseTime, updatedAt: baseTime },
    ])

    await pg.db.insert(projects).values([
      {
        id: ALIVE,
        organizationId: ORG,
        name: "🚀 alpha",
        slug: "alpha",
        settings: { keepMonitoring: true },
        createdAt: baseTime,
        updatedAt: new Date(baseTime.getTime() + 1000),
        firstTraceAt: new Date(baseTime.getTime() + 500),
      },
      {
        id: DELETED,
        organizationId: ORG,
        name: "archived",
        slug: "archived",
        deletedAt: new Date(baseTime.getTime() + 2000),
        createdAt: baseTime,
        updatedAt: baseTime,
      },
    ])
  })

  it("returns the project with its parent organisation inlined", async () => {
    const result = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* AdminProjectRepository
        return yield* repo.findById(ProjectId(ALIVE))
      }),
    )

    expect(result.id).toBe(ALIVE)
    expect(result.name).toBe("🚀 alpha")
    expect(result.slug).toBe("alpha")
    expect(result.settings).toEqual({ keepMonitoring: true })
    expect(result.organization).toEqual({ id: ORG, name: "Project Co", slug: "project-co" })
    expect(result.firstTraceAt).toBeInstanceOf(Date)
    expect(result.deletedAt).toBeNull()
  })

  it("excludes soft-deleted projects (matches the search-results filter)", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminProjectRepository
          return yield* repo.findById(ProjectId(DELETED))
        }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Project" })
  })

  it("fails with NotFoundError for a non-existent project id", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* AdminProjectRepository
          return yield* repo.findById(ProjectId(makeId("proj-missing")))
        }),
      ),
    ).rejects.toMatchObject({ _tag: "NotFoundError", entity: "Project" })
  })
})
