import {
  createDestination,
  type Destination,
  type DestinationConfig,
  DestinationRepository,
} from "@domain/destinations"
import { ConflictError, OrganizationId, ProjectId, type SqlClient, UserId } from "@domain/shared"
import { Cause, Effect, Exit } from "effect"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { organizations } from "../schema/better-auth.ts"
import { destinations } from "../schema/destinations.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { DestinationRepositoryLive } from "./destination-repository.ts"

// Same 32-byte hex key as .env.test for parity. Set on process.env so
// the repository's getEncryptionKey() resolves without ambient .env load.
beforeAll(() => {
  process.env.LAT_MASTER_ENCRYPTION_KEY =
    process.env.LAT_MASTER_ENCRYPTION_KEY ?? "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"
})

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const SANDBOX_ORG = OrganizationId("c".repeat(24))
const PROJECT_A = ProjectId("p".repeat(24))
const PROJECT_B = ProjectId("q".repeat(24))
const PROJECT_C = ProjectId("r".repeat(24))
const CREATOR = UserId("u".repeat(24))

const FIVE_MINUTES_MS = 300_000

const pg = setupTestPostgres()

const runWithLive = <A, E>(
  effect: Effect.Effect<A, E, DestinationRepository | SqlClient>,
  org: OrganizationId = ORG_A,
) => Effect.runPromise(effect.pipe(withPostgres(DestinationRepositoryLive, pg.adminPostgresClient, org)))

const makeConfig = (overrides: Partial<DestinationConfig> = {}): DestinationConfig => ({
  kind: "posthog",
  host: "https://us.i.posthog.com",
  intervalMs: FIVE_MINUTES_MS,
  ...overrides,
})

const makeDestination = (overrides: Partial<Parameters<typeof createDestination>[0]> = {}): Destination =>
  createDestination({
    organizationId: ORG_A,
    projectId: PROJECT_A,
    name: "Acme PostHog",
    config: makeConfig(),
    credentials: { kind: "posthog", apiKey: "phc_super_secret_key" },
    createdByUserId: CREATOR,
    ...overrides,
  })

const save = (destination: Destination, org: OrganizationId = ORG_A) =>
  runWithLive(
    Effect.gen(function* () {
      const repo = yield* DestinationRepository
      yield* repo.save(destination)
    }),
    org,
  )

const seedOrganizations = async () => {
  await pg.db.insert(organizations).values([
    { id: ORG_A, name: "Org A", slug: "org-a" },
    { id: ORG_B, name: "Org B", slug: "org-b" },
    { id: SANDBOX_ORG, name: "Org A sandbox", slug: "org-a-sandbox", parentOrgId: ORG_A },
  ])
}

afterEach(async () => {
  await pg.db.delete(destinations)
  await pg.db.delete(organizations)
})

describe("DestinationRepositoryLive", () => {
  describe("save", () => {
    it("encrypts credentials on write and decrypts them back on read", async () => {
      await seedOrganizations()
      const destination = makeDestination()

      await save(destination)

      const [rawRow] = await pg.db.select().from(destinations)
      expect(rawRow?.credentials).not.toContain("phc_super_secret_key")
      expect(rawRow?.credentials).not.toBe(JSON.stringify(destination.credentials))
      expect(rawRow?.credentials).toContain(":") // iv:authTag:ciphertext format

      const fetched = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          return yield* repo.findById(destination.id)
        }),
      )

      expect(fetched.credentials).toEqual({ kind: "posthog", apiKey: "phc_super_secret_key" })
      expect(fetched.config).toEqual(destination.config)
      expect(fetched.id).toBe(destination.id)
    })

    it("maps the (project_id, kind) unique violation to ConflictError", async () => {
      await seedOrganizations()
      await save(makeDestination())

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          yield* repo.save(makeDestination({ name: "Second PostHog, same project" }))
        }).pipe(withPostgres(DestinationRepositoryLive, pg.adminPostgresClient, ORG_A)),
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const failReason = exit.cause.reasons.find(Cause.isFailReason)
        expect(failReason?.error).toBeInstanceOf(ConflictError)
        expect((failReason?.error as ConflictError).field).toBe("kind")
      }
    })

    it("upserts by id: persists quarantine counter increments and resets", async () => {
      await seedOrganizations()
      const destination = makeDestination()
      await save(destination)

      await save({
        ...destination,
        status: "quarantined",
        consecutiveFailures: 5,
        lastFailureMessage: "posthog: HTTP 401 (non-retryable)",
      })

      const [quarantined] = await pg.db.select().from(destinations)
      expect(quarantined?.status).toBe("quarantined")
      expect(quarantined?.consecutiveFailures).toBe(5)
      expect(quarantined?.lastFailureMessage).toBe("posthog: HTTP 401 (non-retryable)")

      await save({ ...destination, status: "active", consecutiveFailures: 0, lastFailureMessage: null })

      const rows = await pg.db.select().from(destinations)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.status).toBe("active")
      expect(rows[0]?.consecutiveFailures).toBe(0)
      expect(rows[0]?.lastFailureMessage).toBeNull()
    })
  })

  describe("updateQuarantineState", () => {
    it("persists destination-level failure bookkeeping within the RLS org", async () => {
      await seedOrganizations()
      const destination = makeDestination()
      await save(destination)

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          yield* repo.updateQuarantineState({
            id: destination.id,
            status: "quarantined",
            consecutiveFailures: 5,
            lastFailureMessage: "[401] invalid_api_key",
          })
        }),
      )

      const [row] = await pg.db.select().from(destinations)
      expect(row?.status).toBe("quarantined")
      expect(row?.consecutiveFailures).toBe(5)
      expect(row?.lastFailureMessage).toBe("[401] invalid_api_key")

      // A successful run resets the counter and reactivates.
      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          yield* repo.updateQuarantineState({
            id: destination.id,
            status: "active",
            consecutiveFailures: 0,
            lastFailureMessage: null,
          })
        }),
      )

      const [reset] = await pg.db.select().from(destinations)
      expect(reset?.status).toBe("active")
      expect(reset?.consecutiveFailures).toBe(0)
      expect(reset?.lastFailureMessage).toBeNull()
    })

    it("is an org-scoped no-op for a destination in another org", async () => {
      await seedOrganizations()
      const otherOrg = makeDestination({ organizationId: ORG_B, projectId: PROJECT_C })
      await save(otherOrg, ORG_B)

      // ORG_A's context updating ORG_B's row — RLS scopes it to nothing.
      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          yield* repo.updateQuarantineState({
            id: otherOrg.id,
            status: "quarantined",
            consecutiveFailures: 5,
            lastFailureMessage: "should not apply",
          })
        }),
      )

      const [row] = await pg.db.select().from(destinations)
      expect(row?.status).toBe("active")
      expect(row?.consecutiveFailures).toBe(0)
    })
  })

  describe("deleteByProjectId", () => {
    it("deletes the project's destinations in the RLS org and returns their ids", async () => {
      await seedOrganizations()
      const target = makeDestination()
      const otherProject = makeDestination({ projectId: PROJECT_B })
      const otherOrg = makeDestination({ organizationId: ORG_B, projectId: PROJECT_C })

      await save(target)
      await save(otherProject)
      await save(otherOrg, ORG_B)

      const { deleted, crossOrgAttempt } = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          return {
            deleted: yield* repo.deleteByProjectId(PROJECT_A),
            // ORG_B's project, deleted from ORG_A's context — org-scoped no-op.
            crossOrgAttempt: yield* repo.deleteByProjectId(PROJECT_C),
          }
        }),
      )

      expect(deleted).toEqual([target.id])
      expect(crossOrgAttempt).toEqual([])
      const remaining = await pg.db.select({ id: destinations.id }).from(destinations)
      expect(remaining.map((r) => r.id).sort()).toEqual([otherProject.id, otherOrg.id].sort())
    })
  })

  describe("findById", () => {
    it("decrypts credentials and scopes the lookup to the RLS org", async () => {
      await seedOrganizations()
      const destination = makeDestination()
      await save(destination)

      const found = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          return yield* repo.findById(destination.id)
        }),
      )

      expect(found.id).toBe(destination.id)
      expect(found.credentials).toEqual({ kind: "posthog", apiKey: "phc_super_secret_key" })

      // Same row, looked up from another org's context — NotFoundError.
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          return yield* repo.findById(destination.id)
        }).pipe(withPostgres(DestinationRepositoryLive, pg.adminPostgresClient, ORG_B)),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const failReason = exit.cause.reasons.find(Cause.isFailReason)
        expect((failReason?.error as { _tag?: string })._tag).toBe("NotFoundError")
      }
    })
  })

  describe("listByProjectId", () => {
    it("returns the project's destinations, scoped to the RLS org", async () => {
      await seedOrganizations()
      const target = makeDestination()
      const otherProject = makeDestination({ projectId: PROJECT_B })
      const otherOrg = makeDestination({ organizationId: ORG_B, projectId: PROJECT_C })

      await save(target)
      await save(otherProject)
      await save(otherOrg, ORG_B)

      const onProjectA = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          return yield* repo.listByProjectId(PROJECT_A)
        }),
      )
      expect(onProjectA.map((d) => d.id)).toEqual([target.id])
      expect(onProjectA[0]?.credentials).toEqual({ kind: "posthog", apiKey: "phc_super_secret_key" })

      // PROJECT_C belongs to ORG_B — listed from ORG_A's context, RLS returns nothing.
      const crossOrg = await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          return yield* repo.listByProjectId(PROJECT_C)
        }),
      )
      expect(crossOrg).toEqual([])
    })
  })

  describe("delete", () => {
    it("hard-deletes by id within the RLS org and is a no-op cross-org", async () => {
      await seedOrganizations()
      const target = makeDestination()
      const otherOrg = makeDestination({ organizationId: ORG_B, projectId: PROJECT_C })
      await save(target)
      await save(otherOrg, ORG_B)

      await runWithLive(
        Effect.gen(function* () {
          const repo = yield* DestinationRepository
          // ORG_B's row deleted from ORG_A's context — org-scoped no-op.
          yield* repo.delete(otherOrg.id)
          yield* repo.delete(target.id)
        }),
      )

      const remaining = await pg.db.select({ id: destinations.id }).from(destinations)
      expect(remaining.map((r) => r.id)).toEqual([otherOrg.id])
    })
  })
})
