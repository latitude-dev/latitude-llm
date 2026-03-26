import { eq } from "@platform/db-postgres"
import { outboxEvents } from "@platform/db-postgres/schema/outbox-events"
import { projects } from "@platform/db-postgres/schema/projects"
import { scores as scoresTable } from "@platform/db-postgres/schema/scores"
import {
  closeInMemoryPostgres,
  createApiKeyAuthHeaders,
  createInMemoryPostgres,
  type InMemoryPostgres,
} from "@platform/testkit"
import type { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, describe, expect, it, type TestContext } from "vitest"
import { destroyTouchBuffer } from "../middleware/touch-buffer.ts"
import { createProtectedApp, createTenantSetup, TEST_ENCRYPTION_KEY_HEX } from "../test-utils/create-test-app.ts"
import { createScoresRoutes } from "./scores.ts"

interface ScoresRoutesTestContext extends TestContext {
  app: Hono
  database: InMemoryPostgres
}

const createProjectRecord = async (database: InMemoryPostgres, organizationId: string, projectId: string) => {
  await database.db.insert(projects).values({
    id: projectId,
    organizationId,
    name: `Project ${projectId}`,
    slug: `project-${projectId.slice(0, 8)}`,
  })
}

describe("Scores Routes Integration", () => {
  let app: Hono
  let database: InMemoryPostgres

  beforeAll(async () => {
    process.env.LAT_MASTER_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY_HEX
    database = await createInMemoryPostgres()

    const { app: root, protectedRoutes } = createProtectedApp(database)
    protectedRoutes.route("/:organizationId/projects/:projectId/scores", createScoresRoutes())
    root.route("/v1/organizations", protectedRoutes)
    app = root
  })

  beforeEach<ScoresRoutesTestContext>((context) => {
    context.app = app
    context.database = database
  })

  afterAll(async () => {
    await destroyTouchBuffer()
    await closeInMemoryPostgres(database)
  })

  it<ScoresRoutesTestContext>("creates an instrumented custom score and queues publication when the score is immutable", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "cccccccccccccccccccccccc"
    await createProjectRecord(database, tenant.organizationId, projectId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${projectId}/scores`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId: "api-source",
          sessionId: "session-123",
          traceId: "11111111111111111111111111111111",
          spanId: "aaaaaaaaaaaaaaaa",
          value: 0.87,
          passed: true,
          feedback: "Custom API score",
          metadata: {
            rubric: "release-check",
            labels: ["canary"],
          },
          duration: 12_000_000,
          tokens: 123,
          cost: 4_200,
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.source).toBe("custom")
    expect(body.sourceId).toBe("api-source")
    expect(body.traceId).toBe("11111111111111111111111111111111")
    expect(body.createdAt).toBe(body.updatedAt)

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(1)
    expect(persistedScores[0]?.metadata).toEqual({
      rubric: "release-check",
      labels: ["canary"],
    })

    const publicationRequests = await database.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.organizationId, tenant.organizationId))

    expect(publicationRequests).toHaveLength(1)
    expect(publicationRequests[0]?.eventName).toBe("ScoreImmutable")
  })

  it<ScoresRoutesTestContext>("creates an evaluation score through the shared scores endpoint when `_evaluation` is true", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "eeeeeeeeeeeeeeeeeeeeeeee"
    const evaluationId = "ffffffffffffffffffffffff"
    await createProjectRecord(database, tenant.organizationId, projectId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${projectId}/scores`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          _evaluation: true,
          sourceId: evaluationId,
          sessionId: "session-456",
          traceId: "22222222222222222222222222222222",
          spanId: "bbbbbbbbbbbbbbbb",
          value: 0.93,
          passed: true,
          feedback: "Latitude evaluation passed locally",
          metadata: {
            evaluationHash: "eval-hash-v1",
          },
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.source).toBe("evaluation")
    expect(body.sourceId).toBe(evaluationId)
    expect(body.createdAt).toBe(body.updatedAt)
    expect(body.metadata).toEqual({
      evaluationHash: "eval-hash-v1",
    })

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(1)
    expect(persistedScores[0]?.source).toBe("evaluation")
    expect(persistedScores[0]?.sourceId).toBe(evaluationId)
    expect(persistedScores[0]?.metadata).toEqual({
      evaluationHash: "eval-hash-v1",
    })

    const publicationRequests = await database.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.organizationId, tenant.organizationId))

    expect(publicationRequests).toHaveLength(1)
    expect(publicationRequests[0]?.eventName).toBe("ScoreImmutable")
  })

  it<ScoresRoutesTestContext>("creates an uninstrumented custom score without queueing publication for failed non-errored results", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    await createProjectRecord(database, tenant.organizationId, projectId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${projectId}/scores`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId: "manual-source",
          value: 0.12,
          passed: false,
          feedback: "Needs follow-up issue discovery",
          metadata: {
            import: "batch-42",
          },
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.sessionId).toBeNull()
    expect(body.traceId).toBeNull()
    expect(body.spanId).toBeNull()

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(1)
    expect(persistedScores[0]?.sessionId).toBeNull()
    expect(persistedScores[0]?.traceId).toBeNull()
    expect(persistedScores[0]?.spanId).toBeNull()

    const publicationRequests = await database.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.organizationId, tenant.organizationId))

    expect(publicationRequests).toHaveLength(0)
  })

  it<ScoresRoutesTestContext>("rejects invalid score lifecycle payloads", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "dddddddddddddddddddddddd"
    await createProjectRecord(database, tenant.organizationId, projectId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${projectId}/scores`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceId: "api-source",
          value: 0.55,
          passed: true,
          feedback: "This payload should fail",
          error: "passed scores cannot include an error",
        }),
      }),
    )

    expect(response.status).toBe(400)

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(0)
  })
})
