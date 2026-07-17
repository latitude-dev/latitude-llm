import { type Organization, OrganizationRepository } from "@domain/organizations"
import { OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createShowcase } from "../entities/showcase.ts"
import { ShowcaseAlreadyExistsError } from "../errors.ts"
import { ShowcaseRepository } from "../ports/showcase-repository.ts"
import { createFakeShowcaseRepository } from "../testing/fake-showcase-repository.ts"
import { createShowcaseUseCase, SHOWCASE_ORG_NAME, SHOWCASE_ORG_SLUG } from "./create-showcase.ts"

const EXISTING_ORG_ID = OrganizationId("oooooooooooooooooooooooo")

const sqlClient: SqlClientShape = {
  organizationId: EXISTING_ORG_ID,
  transaction: (effect) => effect,
  query: () => Effect.die(new Error("unexpected query")),
}

const provideDeps = <A, E>(
  effect: Effect.Effect<A, E, SqlClient | ShowcaseRepository | OrganizationRepository>,
  {
    showcaseRepository,
    savedOrganizations,
  }: {
    showcaseRepository: ReturnType<typeof createFakeShowcaseRepository>["repository"]
    savedOrganizations: Organization[]
  },
) =>
  effect.pipe(
    Effect.provideService(SqlClient, sqlClient),
    Effect.provideService(ShowcaseRepository, showcaseRepository),
    Effect.provideService(OrganizationRepository, {
      findById: () => Effect.die(new Error("unused")),
      findByIdForUpdate: () => Effect.die(new Error("unused")),
      listByUserId: () => Effect.die(new Error("unused")),
      save: (org) =>
        Effect.sync(() => {
          savedOrganizations.push(org)
        }),
      delete: () => Effect.die(new Error("unused")),
      deleteIfExpiredUnclaimed: () => Effect.die(new Error("unused")),
      countBySlug: () => Effect.die(new Error("unused")),
      listExpiredUnclaimed: () => Effect.die(new Error("unused")),
    }),
  )

describe("createShowcaseUseCase", () => {
  it("creates the showcase org and singleton pointer row when none exists", async () => {
    const { repository, store } = createFakeShowcaseRepository()
    const savedOrganizations: Organization[] = []

    const showcase = await Effect.runPromise(
      provideDeps(createShowcaseUseCase(), { showcaseRepository: repository, savedOrganizations }),
    )

    expect(savedOrganizations).toHaveLength(1)
    expect(savedOrganizations[0]).toMatchObject({ name: SHOWCASE_ORG_NAME, slug: SHOWCASE_ORG_SLUG })

    expect(showcase.id).toBe(1)
    expect(showcase.organizationId).toBe(savedOrganizations[0]?.id)
    expect(showcase.currentProjectId).toBeNull()
    expect(showcase.nextProjectId).toBeNull()
    expect(showcase.nextState).toBeNull()
    expect(store.current).toBe(showcase)
  })

  it("fails loudly (ShowcaseAlreadyExistsError) and creates no org when a showcase already exists", async () => {
    const existing = createShowcase({
      organizationId: OrganizationId("existingshowcaseorg00001"),
      currentProjectId: ProjectId("existingshowcaseproj0001"),
    })
    const { repository, store } = createFakeShowcaseRepository(existing)
    const savedOrganizations: Organization[] = []

    const error = await Effect.runPromise(
      provideDeps(createShowcaseUseCase(), { showcaseRepository: repository, savedOrganizations }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(ShowcaseAlreadyExistsError)
    expect((error as ShowcaseAlreadyExistsError).organizationId).toBe(existing.organizationId)
    // guard runs before any writes: no org created, pointer untouched
    expect(savedOrganizations).toHaveLength(0)
    expect(store.current).toBe(existing)
  })
})
