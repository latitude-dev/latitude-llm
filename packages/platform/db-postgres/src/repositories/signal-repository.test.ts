import { OrganizationId, ProjectId, SignalId, type SqlClient } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { signals } from "../schema/signals.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { SignalRepositoryLive } from "./signal-repository.ts"

const ORG_ID = OrganizationId("org-signal-repo-test".padEnd(24, "x").slice(0, 24))
const PROJECT_ID = ProjectId("proj-signal-repo-test".padEnd(24, "x").slice(0, 24))

const WINDOW_FROM = new Date("2026-03-01T00:00:00.000Z")
const WINDOW_TO = new Date("2026-04-01T00:00:00.000Z")

const pg = setupTestPostgres()

const run = <A, E>(effect: Effect.Effect<A, E, SignalRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(SignalRepositoryLive, pg.adminPostgresClient, ORG_ID)))

const seedSignal = (input: {
  readonly id: string
  readonly slug: string
  readonly createdAt: Date
  readonly resolvedAt?: Date | null
  readonly ignoredAt?: Date | null
}) =>
  pg.db.insert(signals).values({
    id: input.id,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    slug: input.slug,
    name: input.slug,
    description: `${input.slug} description`,
    source: "custom",
    origin: "user",
    resolvedAt: input.resolvedAt ?? null,
    ignoredAt: input.ignoredAt ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  })

// A signal created inside the window, and one created well before it. Neither
// has scores, so occurrence-based membership never applies.
const CREATED_IN_WINDOW = {
  id: "sig-fresh".padEnd(24, "a"),
  slug: "fresh",
  createdAt: new Date("2026-03-15T00:00:00.000Z"),
}
const CREATED_BEFORE_WINDOW = {
  id: "sig-stale".padEnd(24, "b"),
  slug: "stale",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
}

describe("SignalRepositoryLive.listTableRows zero-occurrence membership", () => {
  beforeEach(async () => {
    await pg.db.delete(signals)
    await seedSignal(CREATED_IN_WINDOW)
    await seedSignal(CREATED_BEFORE_WINDOW)
  })

  it("lists a signal created in the window even with no occurrences", async () => {
    const page = await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.listTableRows({
          projectId: PROJECT_ID,
          limit: 50,
          offset: 0,
          timeRange: { from: WINDOW_FROM, to: WINDOW_TO },
        })
      }),
    )

    expect(page.items.map((issue) => issue.id)).toContain(CREATED_IN_WINDOW.id)
    expect(page.items.map((issue) => issue.id)).not.toContain(CREATED_BEFORE_WINDOW.id)
    expect(page.totalCount).toBe(1)
  })

  it("lists every signal when no window is applied", async () => {
    const page = await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.listTableRows({ projectId: PROJECT_ID, limit: 50, offset: 0 })
      }),
    )

    expect(page.totalCount).toBe(2)
    expect(page.items.map((issue) => issue.id).sort()).toEqual([CREATED_IN_WINDOW.id, CREATED_BEFORE_WINDOW.id].sort())
  })
})

describe("SignalRepositoryLive.claimReopenOnOccurrence", () => {
  const RESOLVED_AT = new Date("2026-03-10T00:00:00.000Z")
  const OCCURRED_AFTER = new Date("2026-03-20T00:00:00.000Z")
  const NOW = new Date("2026-03-20T00:00:01.000Z")
  const SIGNAL = { id: "sig-claim".padEnd(24, "c"), slug: "claim", createdAt: new Date("2026-01-01T00:00:00.000Z") }

  const claim = (occurredAt: Date) =>
    run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.claimReopenOnOccurrence({ signalId: SignalId(SIGNAL.id), occurredAt, now: NOW })
      }),
    )

  beforeEach(async () => {
    await pg.db.delete(signals)
  })

  it("reopens a resolved signal exactly once per cycle", async () => {
    await seedSignal({ ...SIGNAL, resolvedAt: RESOLVED_AT })

    await expect(claim(OCCURRED_AFTER)).resolves.toBe(true)

    const [row] = await pg.db.select().from(signals)
    expect(row?.resolvedAt).toBeNull()
    expect(row?.regressedAt).toEqual(NOW)

    // The next occurrence in the same cycle sees resolved_at IS NULL and loses.
    await expect(claim(OCCURRED_AFTER)).resolves.toBe(false)
  })

  it("does not reopen for occurrences at or before the resolve timestamp", async () => {
    await seedSignal({ ...SIGNAL, resolvedAt: RESOLVED_AT })

    await expect(claim(RESOLVED_AT)).resolves.toBe(false)
    await expect(claim(new Date("2026-03-01T00:00:00.000Z"))).resolves.toBe(false)

    const [row] = await pg.db.select().from(signals)
    expect(row?.resolvedAt).toEqual(RESOLVED_AT)
  })

  it("never reopens ignored or unresolved signals", async () => {
    await seedSignal({ ...SIGNAL, resolvedAt: RESOLVED_AT, ignoredAt: RESOLVED_AT })
    await expect(claim(OCCURRED_AFTER)).resolves.toBe(false)

    await pg.db.delete(signals)
    await seedSignal(SIGNAL)
    await expect(claim(OCCURRED_AFTER)).resolves.toBe(false)
  })
})

describe("SignalRepositoryLive.listIdsCreatedInTimeRange", () => {
  beforeEach(async () => {
    await pg.db.delete(signals)
    await seedSignal(CREATED_IN_WINDOW)
    await seedSignal(CREATED_BEFORE_WINDOW)
  })

  it("returns only signals created inside the bounds", async () => {
    const ids = await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.listIdsCreatedInTimeRange({
          projectId: PROJECT_ID,
          timeRange: { from: WINDOW_FROM, to: WINDOW_TO },
        })
      }),
    )

    expect(ids).toEqual([SignalId(CREATED_IN_WINDOW.id)])
  })

  it("returns all non-deleted signals when the range is unbounded", async () => {
    const ids = await run(
      Effect.gen(function* () {
        const repo = yield* SignalRepository
        return yield* repo.listIdsCreatedInTimeRange({ projectId: PROJECT_ID, timeRange: {} })
      }),
    )

    expect([...ids].sort()).toEqual([SignalId(CREATED_IN_WINDOW.id), SignalId(CREATED_BEFORE_WINDOW.id)].sort())
  })
})
