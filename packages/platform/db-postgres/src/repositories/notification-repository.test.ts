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
    type: "incident",
    sourceId: "ai".padEnd(24, "0"),
    payload: { event: "opened", incidentKind: "issue.new" },
    createdAt: new Date(),
    seenAt: null,
    ...overrides,
  })

afterEach(async () => {
  await pg.db.delete(notifications)
})

describe("NotificationRepositoryLive", () => {
  it("bulkInsert dedupes incident notifications on (org, user, source_id, payload->>event)", async () => {
    const sourceId = "ai".padEnd(24, "0")
    const sameKey = makeNotification({ sourceId })
    const sameKeyAgain = makeNotification({ sourceId })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.bulkInsert([sameKey])
        yield* repo.bulkInsert([sameKeyAgain])
      }),
    )

    const all = await pg.db.select().from(notifications)
    expect(all).toHaveLength(1)
  })

  it("opened and closed for the same incident coexist (different payload->>event)", async () => {
    const sourceId = "ai".padEnd(24, "0")
    const opened = makeNotification({ sourceId, payload: { event: "opened", incidentKind: "issue.escalating" } })
    const closed = makeNotification({ sourceId, payload: { event: "closed", incidentKind: "issue.escalating" } })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.bulkInsert([opened])
        yield* repo.bulkInsert([closed])
      }),
    )

    const all = await pg.db.select().from(notifications)
    expect(all).toHaveLength(2)
  })

  it("list returns only the current user's rows in the current org", async () => {
    const mineEarly = makeNotification({ userId: USER_1, sourceId: "ai-1".padEnd(24, "0") })
    const mineLate = makeNotification({
      userId: USER_1,
      sourceId: "ai-2".padEnd(24, "0"),
      createdAt: new Date(Date.now() + 10_000),
    })
    const others = makeNotification({ userId: USER_2, sourceId: "ai-3".padEnd(24, "0") })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.bulkInsert([mineEarly, mineLate, others])
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

  it("list pagination uses (createdAt, id) cursor and returns nextCursor when more remain", async () => {
    const base = Date.now()
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeNotification({
        sourceId: `ai-${i}`.padEnd(24, "0"),
        createdAt: new Date(base + i * 1000),
      }),
    )
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.bulkInsert(rows)
      }),
    )

    const first = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        return yield* repo.list({ organizationId: ORG_A, userId: USER_1, limit: 2 })
      }),
    )
    expect(first.items).toHaveLength(2)
    expect(first.hasMore).toBe(true)
    expect(first.nextCursor).not.toBeNull()

    const second = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        return yield* repo.list({
          organizationId: ORG_A,
          userId: USER_1,
          limit: 2,
          ...(first.nextCursor ? { cursor: first.nextCursor } : {}),
        })
      }),
    )
    expect(second.items).toHaveLength(2)
    expect(second.items.map((i) => i.id)).not.toContain(first.items[0]?.id)
  })

  it("countUnread counts only seen_at IS NULL for the current user", async () => {
    const unread1 = makeNotification({ sourceId: "ai-1".padEnd(24, "0") })
    const unread2 = makeNotification({ sourceId: "ai-2".padEnd(24, "0") })
    const seen = makeNotification({ sourceId: "ai-3".padEnd(24, "0"), seenAt: new Date() })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.bulkInsert([unread1, unread2, seen])
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
    const myUnread = makeNotification({ userId: USER_1, sourceId: "ai-1".padEnd(24, "0") })
    const myAlreadySeen = makeNotification({ userId: USER_1, sourceId: "ai-2".padEnd(24, "0"), seenAt: new Date(0) })
    const otherUserUnread = makeNotification({ userId: USER_2, sourceId: "ai-3".padEnd(24, "0") })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.bulkInsert([myUnread, myAlreadySeen, otherUserUnread])
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
    const inA = makeNotification({ organizationId: ORG_A, sourceId: "ai-1".padEnd(24, "0") })
    const inB = makeNotification({ organizationId: ORG_B, sourceId: "ai-2".padEnd(24, "0") })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.bulkInsert([inA])
      }),
      ORG_A,
    )
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.bulkInsert([inB])
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
