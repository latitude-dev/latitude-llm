import { createOrganization, type Organization, OrganizationRepository } from "@domain/organizations"
import {
  CacheStore,
  type CacheStoreShape,
  NotFoundError,
  OrganizationId,
  ProjectId,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createShowcase } from "../entities/showcase.ts"
import { ShowcaseRepository } from "../ports/showcase-repository.ts"
import { createFakeShowcaseRepository } from "../testing/fake-showcase-repository.ts"
import { resolveShowcaseUseCase } from "./resolve-showcase.ts"

const REQUESTING_ORG_ID = OrganizationId("requestingorgggggggggg01")
const SHOWCASE_ORG_ID = OrganizationId("showcaseorgggggggggggg01")
const SHOWCASE_PROJECT_ID = ProjectId("showcaseprojectttttttt01")

const sqlClient: SqlClientShape = {
  organizationId: REQUESTING_ORG_ID,
  transaction: (effect) => effect,
  query: () => Effect.die(new Error("unexpected query")),
}

const noopCache: CacheStoreShape = {
  get: () => Effect.succeed(null),
  set: () => Effect.void,
  delete: () => Effect.void,
}

const provideDeps = <A, E>(
  effect: Effect.Effect<A, E, SqlClient | CacheStore | ShowcaseRepository | OrganizationRepository>,
  {
    requestingOrg,
    showcaseRepository,
  }: {
    requestingOrg: Organization | null
    showcaseRepository: ReturnType<typeof createFakeShowcaseRepository>["repository"]
  },
) =>
  effect.pipe(
    Effect.provideService(SqlClient, sqlClient),
    Effect.provideService(CacheStore, noopCache),
    Effect.provideService(ShowcaseRepository, showcaseRepository),
    Effect.provideService(OrganizationRepository, {
      findById: (id) =>
        requestingOrg ? Effect.succeed(requestingOrg) : Effect.fail(new NotFoundError({ entity: "Organization", id })),
      listByUserId: () => Effect.die(new Error("unused")),
      save: () => Effect.die(new Error("unused")),
      delete: () => Effect.die(new Error("unused")),
      countBySlug: () => Effect.die(new Error("unused")),
      listExpiredUnclaimed: () => Effect.die(new Error("unused")),
    }),
  )

const orgWithFlag = (wantsShowcase: boolean | undefined) =>
  createOrganization({
    id: REQUESTING_ORG_ID,
    name: "Requesting Org",
    slug: "requesting-org",
    settings: wantsShowcase === undefined ? null : { wantsShowcase },
  })

const liveShowcase = () =>
  createFakeShowcaseRepository(
    createShowcase({ organizationId: SHOWCASE_ORG_ID, currentProjectId: SHOWCASE_PROJECT_ID }),
  )

describe("resolveShowcaseUseCase", () => {
  it("resolves the pinned showcase org+project when the requesting org wants the showcase", async () => {
    const { repository } = liveShowcase()

    const resolved = await Effect.runPromise(
      provideDeps(resolveShowcaseUseCase({ requestingOrganizationId: REQUESTING_ORG_ID }), {
        requestingOrg: orgWithFlag(true),
        showcaseRepository: repository,
      }),
    )

    expect(resolved).toEqual({
      organizationId: SHOWCASE_ORG_ID,
      currentProjectId: SHOWCASE_PROJECT_ID,
    })
  })

  it("404s when the requesting org's wantsShowcase flag is false", async () => {
    const { repository } = liveShowcase()

    const error = await Effect.runPromise(
      provideDeps(resolveShowcaseUseCase({ requestingOrganizationId: REQUESTING_ORG_ID }), {
        requestingOrg: orgWithFlag(false),
        showcaseRepository: repository,
      }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(NotFoundError)
    expect((error as NotFoundError).httpStatus).toBe(404)
  })

  it("404s when the requesting org has no showcase preference set", async () => {
    const { repository } = liveShowcase()

    const error = await Effect.runPromise(
      provideDeps(resolveShowcaseUseCase({ requestingOrganizationId: REQUESTING_ORG_ID }), {
        requestingOrg: orgWithFlag(undefined),
        showcaseRepository: repository,
      }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(NotFoundError)
  })

  it("404s when no showcase exists even though the org wants it", async () => {
    const { repository } = createFakeShowcaseRepository(null)

    const error = await Effect.runPromise(
      provideDeps(resolveShowcaseUseCase({ requestingOrganizationId: REQUESTING_ORG_ID }), {
        requestingOrg: orgWithFlag(true),
        showcaseRepository: repository,
      }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(NotFoundError)
    expect((error as NotFoundError).httpStatus).toBe(404)
  })

  it("404s when a showcase row exists but no project has been built yet (currentProjectId null)", async () => {
    const { repository } = createFakeShowcaseRepository(
      createShowcase({ organizationId: SHOWCASE_ORG_ID, currentProjectId: null }),
    )

    const error = await Effect.runPromise(
      provideDeps(resolveShowcaseUseCase({ requestingOrganizationId: REQUESTING_ORG_ID }), {
        requestingOrg: orgWithFlag(true),
        showcaseRepository: repository,
      }).pipe(Effect.flip),
    )

    expect(error).toBeInstanceOf(NotFoundError)
  })
})
