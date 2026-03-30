import { eq } from "@platform/db-postgres"
import { projects } from "@platform/db-postgres/schema/projects"
import { scores as scoresTable } from "@platform/db-postgres/schema/scores"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

const createProjectRecord = async (database: InMemoryPostgres, organizationId: string, projectId: string) => {
  await database.db.insert(projects).values({
    id: projectId,
    organizationId,
    name: `Project ${projectId}`,
    slug: `project-${projectId.slice(0, 8)}`,
  })
}

describe("Annotations Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("creates an annotation via API with correct defaults", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    await createProjectRecord(database, tenant.organizationId, projectId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${projectId}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 0.2,
          passed: false,
          rawFeedback: "The model hallucinated a date",
          traceId: "11111111111111111111111111111111",
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.source).toBe("annotation")
    expect(body.sourceId).toBe("API")
    expect(body.draftedAt).toBeTruthy()
    expect(body.metadata.rawFeedback).toBe("The model hallucinated a date")
    expect(body.feedback).toBe("The model hallucinated a date")

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(1)
    expect(persistedScores[0]?.source).toBe("annotation")
    expect(persistedScores[0]?.sourceId).toBe("API")
    expect(persistedScores[0]?.draftedAt).not.toBeNull()
  })

  it<ApiTestContext>("creates annotation with anchor metadata", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    await createProjectRecord(database, tenant.organizationId, projectId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${projectId}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 0.1,
          passed: false,
          rawFeedback: "Wrong claim highlighted",
          traceId: "22222222222222222222222222222222",
          messageIndex: 2,
          partIndex: 0,
          startOffset: 10,
          endOffset: 25,
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.metadata.messageIndex).toBe(2)
    expect(body.metadata.partIndex).toBe(0)
    expect(body.metadata.startOffset).toBe(10)
    expect(body.metadata.endOffset).toBe(25)
  })

  it<ApiTestContext>("returns 400 with { error } shape for invalid payloads", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "cccccccccccccccccccccccc"
    await createProjectRecord(database, tenant.organizationId, projectId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${projectId}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 2,
          passed: "not-a-bool",
        }),
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toHaveProperty("error")
    expect(typeof body.error).toBe("string")
    // Should NOT have the raw ZodError shape
    expect(body).not.toHaveProperty("success")

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(0)
  })

  it<ApiTestContext>("returns 404 for non-existent project", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const fakeProjectId = "nnnnnnnnnnnnnnnnnnnnnnnn"

    const response = await app.fetch(
      new Request(`http://localhost/v1/organizations/${tenant.organizationId}/projects/${fakeProjectId}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 0.5,
          passed: true,
          rawFeedback: "Good response",
        }),
      }),
    )

    expect(response.status).toBe(404)
  })
})
