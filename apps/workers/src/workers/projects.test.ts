import { ProjectRepository } from "@domain/projects"
import { generateId, OrganizationId, ProjectId } from "@domain/shared"
import { eq, ProjectRepositoryLive, withPostgres } from "@platform/db-postgres"
import { organizations } from "@platform/db-postgres/schema/better-auth"
import { outboxEvents } from "@platform/db-postgres/schema/outbox-events"
import { projects } from "@platform/db-postgres/schema/projects"
import { setupTestPostgres } from "@platform/db-postgres/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createProjectsWorker } from "./projects.ts"

const pg = setupTestPostgres()

const seedProject = async () => {
  const organizationId = generateId()
  const projectId = generateId()
  await pg.db.insert(organizations).values({
    id: organizationId,
    name: "First Trace Org",
    slug: `first-trace-${organizationId}`,
  })
  await pg.db.insert(projects).values({
    id: projectId,
    organizationId,
    name: "First Trace Project",
    slug: `first-trace-${projectId}`,
  })
  return { organizationId, projectId }
}

const readProject = (organizationId: string, projectId: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* ProjectRepository
      return yield* repo.findById(ProjectId(projectId))
    }).pipe(withPostgres(ProjectRepositoryLive, pg.appPostgresClient, OrganizationId(organizationId))),
  )

describe("createProjectsWorker checkFirstTrace", () => {
  it("stamps firstTraceAt under the RLS runtime role", async () => {
    const { organizationId, projectId } = await seedProject()
    const consumer = new TestQueueConsumer()
    createProjectsWorker({ consumer, postgresClient: pg.appPostgresClient })

    await consumer.dispatchTask("projects", "checkFirstTrace", {
      organizationId,
      projectId,
      traceId: "trace-1",
    })

    const project = await readProject(organizationId, projectId)
    expect(project.firstTraceAt).toBeInstanceOf(Date)

    const events = await pg.db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, projectId))
    expect(events.map((event) => event.eventName)).toEqual(["FirstTraceReceived"])
  })

  it("leaves the milestone alone once it is set", async () => {
    const { organizationId, projectId } = await seedProject()
    const stamped = new Date("2026-01-01T00:00:00.000Z")
    await pg.db.update(projects).set({ firstTraceAt: stamped }).where(eq(projects.id, projectId))

    const consumer = new TestQueueConsumer()
    createProjectsWorker({ consumer, postgresClient: pg.appPostgresClient })
    await consumer.dispatchTask("projects", "checkFirstTrace", {
      organizationId,
      projectId,
      traceId: "trace-2",
    })

    const project = await readProject(organizationId, projectId)
    expect(project.firstTraceAt).toEqual(stamped)

    const events = await pg.db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, projectId))
    expect(events).toHaveLength(0)
  })
})
