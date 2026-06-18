import {
  createDestination,
  createDestinationSourceState,
  type Destination,
  type DestinationConfig,
  DestinationRepository,
  type DestinationSourceState,
  DestinationSourceStateRepository,
  defaultSourceConfig,
} from "@domain/destinations"
import { OrganizationId, ProjectId, type SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { organizations } from "../schema/better-auth.ts"
import { destinationSources } from "../schema/destination-sources.ts"
import { destinations } from "../schema/destinations.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { DestinationRepositoryLive } from "./destination-repository.ts"
import { DestinationSourceStateRepositoryLive } from "./destination-source-state-repository.ts"

// Same 32-byte hex key as .env.test for parity. The destination repo's
// getEncryptionKey() resolves against this when seeding destination rows.
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
const PROJECT_D = ProjectId("s".repeat(24))
const CREATOR = UserId("u".repeat(24))

const SOURCE = "spans" as const
const FIVE_MINUTES_MS = 300_000

const pg = setupTestPostgres()

const withCursorRepo = <A, E>(
  effect: Effect.Effect<A, E, DestinationSourceStateRepository | SqlClient>,
  org: OrganizationId = ORG_A,
) => Effect.runPromise(effect.pipe(withPostgres(DestinationSourceStateRepositoryLive, pg.adminPostgresClient, org)))

const withDestinationRepo = <A, E>(
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

const makeCursor = (
  destination: Destination,
  overrides: Partial<DestinationSourceState> = {},
): DestinationSourceState => ({
  ...createDestinationSourceState({
    organizationId: destination.organizationId,
    destinationId: destination.id,
    source: SOURCE,
    config: defaultSourceConfig(SOURCE),
    watermark: destination.createdAt,
  }),
  ...overrides,
})

const saveDestination = (destination: Destination, org: OrganizationId = ORG_A) =>
  withDestinationRepo(
    Effect.gen(function* () {
      const repo = yield* DestinationRepository
      yield* repo.save(destination)
    }),
    org,
  )

const createCursor = (cursor: DestinationSourceState, org: OrganizationId) =>
  withCursorRepo(
    Effect.gen(function* () {
      const repo = yield* DestinationSourceStateRepository
      yield* repo.create(cursor)
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
  await pg.db.delete(destinationSources)
  await pg.db.delete(destinations)
  await pg.db.delete(organizations)
})

describe("DestinationSourceStateRepositoryLive", () => {
  describe("create / findByDestinationAndSource", () => {
    it("round-trips a cursor scoped to the RLS org", async () => {
      await seedOrganizations()
      const destination = makeDestination()
      await saveDestination(destination)
      const cursor = makeCursor(destination)
      await createCursor(cursor, ORG_A)

      const found = await withCursorRepo(
        Effect.gen(function* () {
          const repo = yield* DestinationSourceStateRepository
          return yield* repo.findByDestinationAndSource({ destinationId: destination.id, source: SOURCE })
        }),
      )

      expect(found?.destinationId).toBe(destination.id)
      expect(found?.source).toBe(SOURCE)
      expect(found?.watermark).toEqual(destination.createdAt)
      expect(found?.watermarkId).toBe("")
      expect(found?.consecutiveEmptyRuns).toBe(0)
      expect(found?.lastRunAt).toBeNull()

      // Same cursor read from another org's context — RLS returns nothing.
      const crossOrg = await withCursorRepo(
        Effect.gen(function* () {
          const repo = yield* DestinationSourceStateRepository
          return yield* repo.findByDestinationAndSource({ destinationId: destination.id, source: SOURCE })
        }),
        ORG_B,
      )
      expect(crossOrg).toBeNull()
    })
  })

  describe("listDue", () => {
    const listDue = (now: Date) =>
      withCursorRepo(
        Effect.gen(function* () {
          const repo = yield* DestinationSourceStateRepository
          return yield* repo.listDue(now)
        }),
      )

    it("selects never-ran and interval-elapsed pairs across orgs, skipping non-active ones", async () => {
      await seedOrganizations()
      const now = new Date("2026-06-12T12:00:00.000Z")
      const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)

      const neverRan = makeDestination()
      const elapsed = makeDestination({ organizationId: ORG_B, projectId: PROJECT_B })
      const recent = makeDestination({ projectId: PROJECT_C })
      const paused: Destination = {
        ...makeDestination({ organizationId: ORG_B, projectId: PROJECT_D }),
        status: "paused",
      }

      await saveDestination(neverRan)
      await saveDestination(elapsed, ORG_B)
      await saveDestination(recent)
      await saveDestination(paused, ORG_B)

      await createCursor(makeCursor(neverRan), ORG_A)
      await createCursor(makeCursor(elapsed, { lastRunAt: minutesAgo(6) }), ORG_B)
      await createCursor(makeCursor(recent, { lastRunAt: minutesAgo(1) }), ORG_A)
      await createCursor(makeCursor(paused), ORG_B)

      const due = await listDue(now)
      expect(due.map((d) => d.destination.id).sort()).toEqual([neverRan.id, elapsed.id].sort())
    })

    it("applies idle backoff with the one-hour ceiling", async () => {
      await seedOrganizations()
      const now = new Date("2026-06-12T12:00:00.000Z")
      const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)

      const backedOffNotDue = makeDestination()
      const backedOffDue = makeDestination({ projectId: PROJECT_B })
      const cappedDue = makeDestination({ organizationId: ORG_B, projectId: PROJECT_C })

      await saveDestination(backedOffNotDue)
      await saveDestination(backedOffDue)
      await saveDestination(cappedDue, ORG_B)

      // 5min × 2^2 = 20min effective interval.
      await createCursor(makeCursor(backedOffNotDue, { lastRunAt: minutesAgo(10), consecutiveEmptyRuns: 2 }), ORG_A)
      await createCursor(makeCursor(backedOffDue, { lastRunAt: minutesAgo(21), consecutiveEmptyRuns: 2 }), ORG_A)
      // 5min × 2^10 would be ~85h; the ceiling clamps it to 60min.
      await createCursor(makeCursor(cappedDue, { lastRunAt: minutesAgo(61), consecutiveEmptyRuns: 10 }), ORG_B)

      const due = await listDue(now)
      expect(due.map((d) => d.destination.id).sort()).toEqual([backedOffDue.id, cappedDue.id].sort())
    })

    it("excludes pairs belonging to sandbox organizations", async () => {
      await seedOrganizations()
      const sandboxDestination = makeDestination({ organizationId: SANDBOX_ORG, projectId: PROJECT_B })
      const regularDestination = makeDestination()

      await saveDestination(sandboxDestination, SANDBOX_ORG)
      await saveDestination(regularDestination)

      await createCursor(makeCursor(sandboxDestination), SANDBOX_ORG)
      await createCursor(makeCursor(regularDestination), ORG_A)

      const due = await listDue(new Date())
      expect(due.map((d) => d.destination.id)).toEqual([regularDestination.id])
    })
  })

  describe("advanceCursor", () => {
    it("claims the write when the row still holds the expected cursor", async () => {
      await seedOrganizations()
      const destination = makeDestination()
      await saveDestination(destination)
      const cursor = makeCursor(destination)
      await createCursor(cursor, ORG_A)

      const next = { watermark: new Date("2026-06-12T11:00:00.000Z"), id: "00f067aa0ba902b7" }
      const won = await withCursorRepo(
        Effect.gen(function* () {
          const repo = yield* DestinationSourceStateRepository
          return yield* repo.advanceCursor({
            destinationId: destination.id,
            source: SOURCE,
            expected: { watermark: cursor.watermark, id: cursor.watermarkId },
            next,
          })
        }),
      )

      expect(won).toBe(true)
      const [row] = await pg.db.select().from(destinationSources)
      expect(row?.watermark).toEqual(next.watermark)
      expect(row?.watermarkId).toBe(next.id)
    })

    it("rejects a stale expected pair and leaves the cursor untouched", async () => {
      await seedOrganizations()
      const destination = makeDestination()
      await saveDestination(destination)
      const cursor = makeCursor(destination)
      await createCursor(cursor, ORG_A)

      const initial = { watermark: cursor.watermark, id: cursor.watermarkId }
      const first = { watermark: new Date("2026-06-12T11:00:00.000Z"), id: "00f067aa0ba902b7" }
      const second = { watermark: new Date("2026-06-12T11:05:00.000Z"), id: "00f067aa0ba902b8" }

      const results = await withCursorRepo(
        Effect.gen(function* () {
          const repo = yield* DestinationSourceStateRepository
          const winner = yield* repo.advanceCursor({
            destinationId: destination.id,
            source: SOURCE,
            expected: initial,
            next: first,
          })
          // A concurrent run that started from the same initial cursor loses.
          const stale = yield* repo.advanceCursor({
            destinationId: destination.id,
            source: SOURCE,
            expected: initial,
            next: second,
          })
          // A run that read the advanced cursor wins again.
          const fresh = yield* repo.advanceCursor({
            destinationId: destination.id,
            source: SOURCE,
            expected: first,
            next: second,
          })
          return { winner, stale, fresh }
        }),
      )

      expect(results).toEqual({ winner: true, stale: false, fresh: true })
      const [row] = await pg.db.select().from(destinationSources)
      expect(row?.watermark).toEqual(second.watermark)
      expect(row?.watermarkId).toBe(second.id)
    })
  })

  describe("setWatermark", () => {
    it("sets the watermark unconditionally (the re-enable cursor jump)", async () => {
      await seedOrganizations()
      const destination = makeDestination()
      await saveDestination(destination)
      const cursor = makeCursor(destination)
      await createCursor(cursor, ORG_A)

      const jumped = { watermark: new Date("2026-06-13T00:00:00.000Z"), id: "" }
      await withCursorRepo(
        Effect.gen(function* () {
          const repo = yield* DestinationSourceStateRepository
          yield* repo.setWatermark({ destinationId: destination.id, source: SOURCE, watermark: jumped })
        }),
      )

      const [row] = await pg.db.select().from(destinationSources)
      expect(row?.watermark).toEqual(jumped.watermark)
      expect(row?.watermarkId).toBe("")
    })
  })

  describe("updateRunState", () => {
    it("persists idle-backoff bookkeeping without touching the watermark", async () => {
      await seedOrganizations()
      const destination = makeDestination()
      await saveDestination(destination)
      const cursor = makeCursor(destination)
      await createCursor(cursor, ORG_A)

      const lastRunAt = new Date("2026-06-12T11:30:00.000Z")
      await withCursorRepo(
        Effect.gen(function* () {
          const repo = yield* DestinationSourceStateRepository
          yield* repo.updateRunState({
            destinationId: destination.id,
            source: SOURCE,
            consecutiveEmptyRuns: 4,
            lastRunAt,
          })
        }),
      )

      const [row] = await pg.db.select().from(destinationSources)
      expect(row?.consecutiveEmptyRuns).toBe(4)
      expect(row?.lastRunAt).toEqual(lastRunAt)
      expect(row?.watermark).toEqual(cursor.watermark)
      expect(row?.watermarkId).toBe("")
    })
  })

  describe("deleteByDestinationId", () => {
    it("removes the destination's cursors within the RLS org and is a no-op cross-org", async () => {
      await seedOrganizations()
      const target = makeDestination()
      const otherOrg = makeDestination({ organizationId: ORG_B, projectId: PROJECT_C })
      await saveDestination(target)
      await saveDestination(otherOrg, ORG_B)
      await createCursor(makeCursor(target), ORG_A)
      await createCursor(makeCursor(otherOrg), ORG_B)

      await withCursorRepo(
        Effect.gen(function* () {
          const repo = yield* DestinationSourceStateRepository
          // ORG_B's cursor deleted from ORG_A's context — org-scoped no-op.
          yield* repo.deleteByDestinationId(otherOrg.id)
          yield* repo.deleteByDestinationId(target.id)
        }),
      )

      const remaining = await pg.db.select({ destinationId: destinationSources.destinationId }).from(destinationSources)
      expect(remaining.map((r) => r.destinationId)).toEqual([otherOrg.id])
    })
  })
})
