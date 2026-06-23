import { FlaggerId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { FLAGGER_DEFAULT_SAMPLING } from "../constants.ts"
import type { Flagger } from "../entities/flagger.ts"
import { FLAGGER_DEFAULT_ENABLED } from "../entities/flagger.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { createFakeFlaggerRepository } from "../testing/fake-flagger-repository.ts"
import { findOrCreateFlaggerUseCase } from "./find-or-create-flagger.ts"

const ORG_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("p".repeat(24))

const makeLayer = (repository: ReturnType<typeof createFakeFlaggerRepository>["repository"]) =>
  Layer.mergeAll(
    Layer.succeed(FlaggerRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
  )

describe("findOrCreateFlaggerUseCase", () => {
  it("returns the existing row untouched without creating a duplicate", async () => {
    const seed: Flagger = {
      id: FlaggerId("jailbreaking".padEnd(24, "x").slice(0, 24)),
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      slug: "jailbreaking",
      enabled: false,
      sampling: 25,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const { repository, flaggers } = createFakeFlaggerRepository([seed])

    const result = await Effect.runPromise(
      findOrCreateFlaggerUseCase({ projectId: PROJECT_ID, slug: "jailbreaking" }).pipe(
        Effect.provide(makeLayer(repository)),
      ),
    )

    expect(result?.id).toBe(seed.id)
    expect(result?.enabled).toBe(false)
    expect(result?.sampling).toBe(25)
    expect(flaggers.size).toBe(1)
  })

  it("creates the row with defaults when the project has none for the slug", async () => {
    const { repository, flaggers } = createFakeFlaggerRepository([])

    const result = await Effect.runPromise(
      findOrCreateFlaggerUseCase({ projectId: PROJECT_ID, slug: "low-cache-hit-rate" }).pipe(
        Effect.provide(makeLayer(repository)),
      ),
    )

    expect(result?.slug).toBe("low-cache-hit-rate")
    expect(result?.projectId).toBe(PROJECT_ID)
    expect(result?.organizationId).toBe(ORG_ID)
    expect(result?.enabled).toBe(FLAGGER_DEFAULT_ENABLED)
    expect(result?.sampling).toBe(FLAGGER_DEFAULT_SAMPLING)
    expect(flaggers.size).toBe(1)
  })

  it("is idempotent: a second call returns the same row and creates no duplicate", async () => {
    const { repository, flaggers } = createFakeFlaggerRepository([])

    const first = await Effect.runPromise(
      findOrCreateFlaggerUseCase({ projectId: PROJECT_ID, slug: "low-cache-hit-rate" }).pipe(
        Effect.provide(makeLayer(repository)),
      ),
    )
    const second = await Effect.runPromise(
      findOrCreateFlaggerUseCase({ projectId: PROJECT_ID, slug: "low-cache-hit-rate" }).pipe(
        Effect.provide(makeLayer(repository)),
      ),
    )

    expect(first?.id).toBeDefined()
    expect(second?.id).toBe(first?.id)
    expect(flaggers.size).toBe(1)
  })
})
