import { OrganizationId, ProjectId } from "@domain/shared"
import { outboxEvents } from "@platform/db-postgres/schema/outbox-events"
import { projects } from "@platform/db-postgres/schema/projects"
import { showcase } from "@platform/db-postgres/schema/showcase"
import { setupTestPostgres } from "@platform/testkit"
import { beforeEach, describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createShowcaseWorker } from "./showcase.ts"

const pg = setupTestPostgres()

const ORG = OrganizationId("s".repeat(24))
const CURRENT = ProjectId("c".repeat(24))
const NEXT = ProjectId("n".repeat(24))
const ORPHAN = ProjectId("o".repeat(24))

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

const insertProject = async (id: ProjectId, name: string, ageMs: number) => {
  const at = new Date(Date.now() - ageMs)
  await pg.db.insert(projects).values({
    id,
    organizationId: ORG,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    settings: { isShowcase: true },
    createdAt: at,
    updatedAt: at,
  })
}

const insertPointer = async (params: {
  current: ProjectId | null
  next: ProjectId | null
  nextState: "building" | "ready" | null
  pointerAgeMs: number
}) => {
  const at = new Date(Date.now() - params.pointerAgeMs)
  await pg.db.insert(showcase).values({
    id: 1,
    organizationId: ORG,
    currentProjectId: params.current,
    nextProjectId: params.next,
    nextState: params.nextState,
    createdAt: at,
    updatedAt: at,
  })
}

const runCleanup = async () => {
  const consumer = new TestQueueConsumer()
  createShowcaseWorker({ consumer, postgresClient: pg.adminPostgresClient })
  await consumer.dispatchTask("showcase", "cleanup", {})
}

const findProject = async (id: ProjectId) => {
  const rows = await pg.db.select().from(projects)
  return rows.find((row) => row.id === id)
}

const projectDeletedEvents = async () => {
  const rows = await pg.db.select().from(outboxEvents)
  return rows.filter((row) => row.eventName === "ProjectDeleted" && row.organizationId === ORG)
}

const readPointer = async () => {
  const [row] = await pg.db.select().from(showcase)
  return row
}

describe("showcase cleanup worker (retirement flow)", () => {
  beforeEach(async () => {
    await pg.db.delete(outboxEvents)
    await pg.db.delete(projects)
    await pg.db.delete(showcase)
  })

  it("retires the swapped-out orphan (soft-delete + ProjectDeleted) and leaves the live current untouched", async () => {
    await insertProject(CURRENT, "Current", DAY_MS)
    await insertProject(ORPHAN, "Old Current", DAY_MS)
    await insertPointer({ current: CURRENT, next: null, nextState: null, pointerAgeMs: DAY_MS })

    await runCleanup()

    expect((await findProject(ORPHAN))?.deletedAt).not.toBeNull()
    expect((await findProject(CURRENT))?.deletedAt).toBeNull()

    const events = await projectDeletedEvents()
    expect(events.map((e) => e.aggregateId)).toEqual([ORPHAN])

    // pointer is untouched — nothing was building to reclaim
    const pointer = await readPointer()
    expect(pointer?.currentProjectId).toBe(CURRENT)
    expect(pointer?.nextProjectId).toBeNull()
  })

  it("reclaims a stale building pointer to idle and retires the half-built next", async () => {
    await insertProject(CURRENT, "Current", DAY_MS)
    await insertProject(NEXT, "Half Built", DAY_MS)
    // pointer last advanced 3h ago → past the 2h stale threshold
    await insertPointer({ current: CURRENT, next: NEXT, nextState: "building", pointerAgeMs: 3 * HOUR_MS })

    await runCleanup()

    const pointer = await readPointer()
    expect(pointer?.nextProjectId).toBeNull()
    expect(pointer?.nextState).toBeNull()
    expect(pointer?.currentProjectId).toBe(CURRENT)

    expect((await findProject(NEXT))?.deletedAt).not.toBeNull()
    expect((await findProject(CURRENT))?.deletedAt).toBeNull()
    expect((await projectDeletedEvents()).map((e) => e.aggregateId)).toEqual([NEXT])
  })

  it("does NOT reclaim or retire a healthy in-flight build", async () => {
    await insertProject(CURRENT, "Current", DAY_MS)
    // next just provisioned (recent) and pointer just advanced → not stale, within grace
    await insertProject(NEXT, "Building Now", 60_000)
    await insertPointer({ current: CURRENT, next: NEXT, nextState: "building", pointerAgeMs: 60_000 })

    await runCleanup()

    const pointer = await readPointer()
    expect(pointer?.nextProjectId).toBe(NEXT)
    expect(pointer?.nextState).toBe("building")

    expect((await findProject(NEXT))?.deletedAt).toBeNull()
    expect((await findProject(CURRENT))?.deletedAt).toBeNull()
    expect(await projectDeletedEvents()).toHaveLength(0)
  })

  it("no-ops cleanly when no showcase pointer exists", async () => {
    await expect(runCleanup()).resolves.toBeUndefined()
  })
})
