import { defaultEvaluationTrigger, emptyEvaluationAlignment } from "@domain/evaluations"
import { createIssueCentroid } from "@domain/issues"
import { queryClickhouse } from "@platform/db-clickhouse"
import { eq } from "@platform/db-postgres"
import { evaluations } from "@platform/db-postgres/schema/evaluations"
import { issues } from "@platform/db-postgres/schema/issues"
import { outboxEvents } from "@platform/db-postgres/schema/outbox-events"
import { projects } from "@platform/db-postgres/schema/projects"
import { scores as scoresTable } from "@platform/db-postgres/schema/scores"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

const API_TEST_ANCHOR_TRACE_ID = "22222222222222222222222222222222" as const

const createProjectRecord = async (database: InMemoryPostgres, organizationId: string, projectId: string) => {
  await database.db.insert(projects).values({
    id: projectId,
    organizationId,
    name: `Project ${projectId}`,
    slug: `project-${projectId.slice(0, 8)}`,
  })
}

const queryAnalyticsScores = (clickhouse: ApiTestContext["clickhouse"], organizationId: string, scoreId: string) =>
  Effect.runPromise(
    queryClickhouse<{ id: string; source_id: string }>(
      clickhouse,
      `SELECT id, source_id
       FROM scores
       WHERE organization_id = {organizationId:String}
         AND id = {scoreId:FixedString(24)}`,
      { organizationId, scoreId },
    ),
  ).then((rows) =>
    rows.map((row) => ({
      ...row,
      source_id: row.source_id.replace(/\0+$/u, ""),
    })),
  )

describe("Scores Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("creates an instrumented custom score and syncs analytics immediately when the score is immutable", async ({
    app,
    database,
    clickhouse,
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

    expect(publicationRequests).toHaveLength(0)

    const analyticsRows = await queryAnalyticsScores(clickhouse, tenant.organizationId, body.id)
    expect(analyticsRows).toHaveLength(1)
    expect(analyticsRows[0]?.source_id).toBe("api-source")
  })

  it<ApiTestContext>("creates an evaluation score through the shared scores endpoint and syncs analytics when `_evaluation` is true", async ({
    app,
    database,
    clickhouse,
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
          traceId: API_TEST_ANCHOR_TRACE_ID,
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

    expect(publicationRequests).toHaveLength(0)

    const analyticsRows = await queryAnalyticsScores(clickhouse, tenant.organizationId, body.id)
    expect(analyticsRows).toHaveLength(1)
    expect(analyticsRows[0]?.source_id).toBe(evaluationId)
  })

  it<ApiTestContext>("queues centralized discovery for failed scores from issue-linked evaluations", async ({
    app,
    database,
    clickhouse,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "aa11aa11aa11aa11aa11aa11"
    const evaluationId = "bb22bb22bb22bb22bb22bb22"
    const issueId = "ii33ii33ii33ii33ii33ii33"
    await createProjectRecord(database, tenant.organizationId, projectId)

    await database.db.insert(issues).values({
      id: issueId,
      uuid: crypto.randomUUID(),
      organizationId: tenant.organizationId,
      projectId,
      name: "Test Issue",
      description: "An issue for testing direct assignment",
      centroid: createIssueCentroid(),
      clusteredAt: new Date(),
    })

    await database.db.insert(evaluations).values({
      id: evaluationId,
      organizationId: tenant.organizationId,
      projectId,
      issueId,
      name: "Test Evaluation",
      description: "An evaluation linked to the test issue",
      script: "return { passed: false }",
      trigger: defaultEvaluationTrigger(),
      alignment: emptyEvaluationAlignment("abc123"),
      alignedAt: new Date(),
    })

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
          traceId: API_TEST_ANCHOR_TRACE_ID,
          spanId: "cccccccccccccccc",
          value: 0.1,
          passed: false,
          feedback: "The agent hallucinated the date",
          metadata: { evaluationHash: "eval-hash-v2" },
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.source).toBe("evaluation")
    expect(body.issueId).toBeNull()

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(1)
    expect(persistedScores[0]?.issueId).toBeNull()

    const outboxRows = await database.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.organizationId, tenant.organizationId))

    expect(outboxRows).toHaveLength(1)
    expect(outboxRows[0]?.eventName).toBe("IssueDiscoveryRequested")
    expect(outboxRows[0]?.payload).toEqual({
      organizationId: tenant.organizationId,
      projectId,
      scoreId: body.id,
      issueId: null,
    })

    const analyticsRows = await queryAnalyticsScores(clickhouse, tenant.organizationId, body.id)
    expect(analyticsRows).toHaveLength(0)
  })

  it<ApiTestContext>("requests discovery for failed evaluation scores even when the evaluation is missing", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "dd44dd44dd44dd44dd44dd44"
    const missingEvalId = "nn55nn55nn55nn55nn55nn55"
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
          sourceId: missingEvalId,
          traceId: API_TEST_ANCHOR_TRACE_ID,
          spanId: "dddddddddddddddd",
          value: 0.05,
          passed: false,
          feedback: "Missing evaluation fallback test",
          metadata: { evaluationHash: "eval-hash-v3" },
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.source).toBe("evaluation")
    expect(body.issueId).toBeNull()

    const outboxRows = await database.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.organizationId, tenant.organizationId))

    expect(outboxRows).toHaveLength(1)
    expect(outboxRows[0]?.eventName).toBe("IssueDiscoveryRequested")
    expect(outboxRows[0]?.payload).toEqual({
      organizationId: tenant.organizationId,
      projectId,
      scoreId: body.id,
      issueId: null,
    })
  })

  it<ApiTestContext>("keeps passed scores from linked evaluations unowned and syncs analytics without issue refresh", async ({
    app,
    database,
    clickhouse,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "gg88gg88gg88gg88gg88gg88"
    const evaluationId = "hh99hh99hh99hh99hh99hh99"
    const issueId = "kk00kk00kk00kk00kk00kk00"
    await createProjectRecord(database, tenant.organizationId, projectId)

    await database.db.insert(issues).values({
      id: issueId,
      uuid: crypto.randomUUID(),
      organizationId: tenant.organizationId,
      projectId,
      name: "Linked issue",
      description: "Used to verify passed linked evaluations stay unowned",
      centroid: createIssueCentroid(),
      clusteredAt: new Date(),
    })

    await database.db.insert(evaluations).values({
      id: evaluationId,
      organizationId: tenant.organizationId,
      projectId,
      issueId,
      name: "Linked Evaluation",
      description: "Linked evaluation that passes",
      script: "return { passed: true }",
      trigger: defaultEvaluationTrigger(),
      alignment: emptyEvaluationAlignment("abc123"),
      alignedAt: new Date(),
    })

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
          traceId: API_TEST_ANCHOR_TRACE_ID,
          spanId: "ffffffffffffffff",
          value: 0.95,
          passed: true,
          feedback: "Passed linked evaluation should not become an issue occurrence",
          metadata: { evaluationHash: "eval-hash-v5" },
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.issueId).toBeNull()

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(1)
    expect(persistedScores[0]?.issueId).toBeNull()

    const outboxRows = await database.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.organizationId, tenant.organizationId))

    expect(outboxRows).toHaveLength(0)

    const analyticsRows = await queryAnalyticsScores(clickhouse, tenant.organizationId, body.id)
    expect(analyticsRows).toHaveLength(1)
  })

  it<ApiTestContext>("creates an uninstrumented custom score and requests issue discovery for failed non-errored results", async ({
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

    expect(publicationRequests).toHaveLength(1)
    expect(publicationRequests[0]?.eventName).toBe("IssueDiscoveryRequested")
    expect(publicationRequests[0]?.payload).toEqual({
      organizationId: tenant.organizationId,
      projectId,
      scoreId: body.id,
      issueId: null,
    })
  })

  it<ApiTestContext>("rejects invalid score lifecycle payloads", async ({ app, database }) => {
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
    const body = await response.json()
    expect(body).toHaveProperty("error")
    expect(typeof body.error).toBe("string")

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(0)
  })
})
