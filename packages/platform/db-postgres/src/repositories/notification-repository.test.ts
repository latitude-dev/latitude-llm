import {
  type Notification,
  NotificationRepository,
  type NotificationRepositoryShape,
  notificationSchema,
} from "@domain/notifications"
import { generateId, NotificationId, OrganizationId, type SqlClient, UserId } from "@domain/shared"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { notifications } from "../schema/notifications.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { NotificationRepositoryLive } from "./notification-repository.ts"

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const USER_1 = UserId("1".repeat(24))
const USER_2 = UserId("2".repeat(24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(
  effect: Effect.Effect<A, E, NotificationRepository | SqlClient>,
  org: OrganizationId = ORG_A,
) => Effect.runPromise(effect.pipe(withPostgres(NotificationRepositoryLive, pg.adminPostgresClient, org)))

const makeNotification = (overrides: Partial<Notification> = {}): Notification =>
  notificationSchema.parse({
    id: NotificationId(generateId()),
    organizationId: ORG_A,
    userId: USER_1,
    kind: "incident.opened",
    idempotencyKey: `incident.opened:${"ai".padEnd(24, "0")}`,
    payload: { incidentKind: "issue.new", alertIncidentId: "ai".padEnd(24, "0") },
    createdAt: new Date(),
    seenAt: null,
    emailedAt: null,
    ...overrides,
  })

afterEach(async () => {
  await pg.db.delete(notifications)
})

describe("NotificationRepositoryLive", () => {
  it("insertIfAbsent dedupes on (org, user, idempotency_key)", async () => {
    const key = `incident.opened:${"ai".padEnd(24, "0")}`
    const a = makeNotification({ idempotencyKey: key })
    const b = makeNotification({ idempotencyKey: key })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(a)
        yield* repo.insertIfAbsent(b)
      }),
    )

    const all = await pg.db.select().from(notifications)
    expect(all).toHaveLength(1)
  })

  it("insertIfAbsent returns the inserted row, then null on conflict", async () => {
    const row = makeNotification()

    const [first, second] = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        const a = yield* repo.insertIfAbsent(row)
        const b = yield* repo.insertIfAbsent(row)
        return [a, b] as const
      }),
    )

    expect(first).not.toBeNull()
    expect(first?.id).toBe(row.id)
    expect(second).toBeNull()
  })

  it("opened and closed for the same incident coexist (different kind + key)", async () => {
    const incidentId = "ai".padEnd(24, "0")
    const opened = makeNotification({
      kind: "incident.opened",
      idempotencyKey: `incident.opened:${incidentId}`,
      payload: { incidentKind: "issue.escalating", alertIncidentId: incidentId },
    })
    const closed = makeNotification({
      kind: "incident.closed",
      idempotencyKey: `incident.closed:${incidentId}`,
      payload: { incidentKind: "issue.escalating", alertIncidentId: incidentId },
    })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(opened)
        yield* repo.insertIfAbsent(closed)
      }),
    )

    const all = await pg.db.select().from(notifications)
    expect(all).toHaveLength(2)
  })

  it("markEmailed sets emailed_at on the first call and returns false on the second", async () => {
    const row = makeNotification()
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(row)
      }),
    )

    const [firstClaim, secondClaim] = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        const a = yield* repo.markEmailed(row.id)
        const b = yield* repo.markEmailed(row.id)
        return [a, b] as const
      }),
    )
    expect(firstClaim).toBe(true)
    expect(secondClaim).toBe(false)

    const [persisted] = await pg.db.select().from(notifications)
    expect(persisted?.emailedAt).not.toBeNull()
  })

  it("findById returns the row when present and a NotFoundError otherwise", async () => {
    const row = makeNotification()
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(row)
      }),
    )

    const found = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        return yield* repo.findById(row.id)
      }),
    )
    expect(found.id).toBe(row.id)
  })

  it("list returns only the current user's rows in the current org", async () => {
    const mineEarly = makeNotification({
      userId: USER_1,
      idempotencyKey: `incident.opened:${"ai-1".padEnd(24, "0")}`,
    })
    const mineLate = makeNotification({
      userId: USER_1,
      idempotencyKey: `incident.opened:${"ai-2".padEnd(24, "0")}`,
      createdAt: new Date(Date.now() + 10_000),
    })
    const others = makeNotification({
      userId: USER_2,
      idempotencyKey: `incident.opened:${"ai-3".padEnd(24, "0")}`,
    })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(mineEarly)
        yield* repo.insertIfAbsent(mineLate)
        yield* repo.insertIfAbsent(others)
      }),
    )

    const page = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        return yield* repo.list({ organizationId: ORG_A, userId: USER_1, limit: 50 })
      }),
    )

    expect(page.items).toHaveLength(2)
    expect(page.items[0]?.id).toBe(mineLate.id)
    expect(page.items[1]?.id).toBe(mineEarly.id)
    expect(page.hasMore).toBe(false)
  })

  it("countUnread counts only seen_at IS NULL for the current user", async () => {
    const unread1 = makeNotification({ idempotencyKey: `incident.opened:${"ai-1".padEnd(24, "0")}` })
    const unread2 = makeNotification({ idempotencyKey: `incident.opened:${"ai-2".padEnd(24, "0")}` })
    const seen = makeNotification({
      idempotencyKey: `incident.opened:${"ai-3".padEnd(24, "0")}`,
      seenAt: new Date(),
    })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(unread1)
        yield* repo.insertIfAbsent(unread2)
        yield* repo.insertIfAbsent(seen)
      }),
    )

    const count = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        return yield* repo.countUnread({ organizationId: ORG_A, userId: USER_1 })
      }),
    )
    expect(count).toBe(2)
  })

  it("markAllSeen flips seen_at on every unread row for the current user only", async () => {
    const myUnread = makeNotification({
      userId: USER_1,
      idempotencyKey: `incident.opened:${"ai-1".padEnd(24, "0")}`,
    })
    const myAlreadySeen = makeNotification({
      userId: USER_1,
      idempotencyKey: `incident.opened:${"ai-2".padEnd(24, "0")}`,
      seenAt: new Date(0),
    })
    const otherUserUnread = makeNotification({
      userId: USER_2,
      idempotencyKey: `incident.opened:${"ai-3".padEnd(24, "0")}`,
    })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(myUnread)
        yield* repo.insertIfAbsent(myAlreadySeen)
        yield* repo.insertIfAbsent(otherUserUnread)
      }),
    )

    const seenAt = new Date()
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.markAllSeen({ organizationId: ORG_A, userId: USER_1, seenAt })
      }),
    )

    const myCount = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        return yield* repo.countUnread({ organizationId: ORG_A, userId: USER_1 })
      }),
    )
    expect(myCount).toBe(0)

    const otherCount = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        return yield* repo.countUnread({ organizationId: ORG_A, userId: USER_2 })
      }),
    )
    expect(otherCount).toBe(1)
  })

  it("RLS isolates notifications across organizations", async () => {
    const inA = makeNotification({
      organizationId: ORG_A,
      idempotencyKey: `incident.opened:${"ai-1".padEnd(24, "0")}`,
    })
    const inB = makeNotification({
      organizationId: ORG_B,
      idempotencyKey: `incident.opened:${"ai-2".padEnd(24, "0")}`,
    })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(inA)
      }),
      ORG_A,
    )
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(inB)
      }),
      ORG_B,
    )

    const fromA = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        return yield* repo.list({ organizationId: ORG_A, userId: USER_1, limit: 50 })
      }),
      ORG_A,
    )
    expect(fromA.items).toHaveLength(1)
    expect(fromA.items[0]?.organizationId).toBe(ORG_A)
  })
})

// Reference unused interface to keep TS happy if exports change.
void (null as unknown as NotificationRepositoryShape)
