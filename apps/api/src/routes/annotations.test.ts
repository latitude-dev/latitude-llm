import { OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { type SpanDetail, SpanRepository } from "@domain/spans"
import { stubListSpan } from "@domain/spans/testing"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { eq } from "@platform/db-postgres"
import { projects } from "@platform/db-postgres/schema/projects"
import { scores as scoresTable } from "@platform/db-postgres/schema/scores"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

const API_TEST_ANCHOR_TRACE_ID = "22222222222222222222222222222222" as const

const createProjectRecord = async (
  database: InMemoryPostgres,
  organizationId: string,
  projectId: string,
): Promise<string> => {
  const slug = `project-${projectId.slice(0, 8)}`
  await database.db.insert(projects).values({
    id: projectId,
    organizationId,
    name: `Project ${projectId}`,
    slug,
  })
  return slug
}

const textMessage = (role: "user" | "assistant", content: string): SpanDetail["inputMessages"][number] => ({
  role,
  parts: [{ type: "text", content }],
})

const buildAnnotationSpanDetail = ({
  organizationId,
  projectId,
  traceId,
  sessionId = "session",
  inputMessages,
  outputMessages,
}: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly sessionId?: string
  readonly inputMessages: SpanDetail["inputMessages"]
  readonly outputMessages: SpanDetail["outputMessages"]
}): SpanDetail => ({
  ...stubListSpan({
    organizationId: OrganizationId(organizationId),
    projectId: ProjectId(projectId),
    traceId: TraceId(traceId),
    sessionId: SessionId(sessionId),
    spanId: SpanId("cccccccccccccccc"),
    operation: "chat",
    startTime: new Date("2026-03-24T00:00:00.000Z"),
    endTime: new Date("2026-03-24T00:01:00.000Z"),
  }),
  inputMessages,
  outputMessages,
  systemInstructions: [],
  toolDefinitions: [],
  toolCallId: "",
  toolName: "",
  toolInput: "",
  toolOutput: "",
})

const seedAnnotationTrace = async ({
  clickhouse,
  organizationId,
  projectId,
  traceId,
  sessionId,
  inputMessages = [textMessage("user", "hello")],
  outputMessages = [textMessage("assistant", "hello")],
}: {
  readonly clickhouse: ApiTestContext["clickhouse"]
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly sessionId?: string
  readonly inputMessages?: SpanDetail["inputMessages"]
  readonly outputMessages?: SpanDetail["outputMessages"]
}) => {
  const span = buildAnnotationSpanDetail({
    organizationId,
    projectId,
    traceId,
    ...(sessionId !== undefined ? { sessionId } : {}),
    inputMessages,
    outputMessages,
  })

  await Effect.runPromise(
    Effect.gen(function* () {
      const spanRepository = yield* SpanRepository
      yield* spanRepository.insert([span])
    }).pipe(withClickHouse(SpanRepositoryLive, clickhouse, OrganizationId(organizationId))),
  )
}

describe("Annotations Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("creates a published annotation by default (draftedAt=null)", async ({
    app,
    database,
    clickhouse,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const traceId = "11111111111111111111111111111111"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)
    await seedAnnotationTrace({
      clickhouse,
      organizationId: tenant.organizationId,
      projectId,
      traceId,
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 0.2,
          passed: false,
          feedback: "The model hallucinated a date",
          trace: { by: "id", id: traceId },
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.source).toBe("annotation")
    expect(body.sourceId).toBe("API")
    expect(body.draftedAt).toBeNull()
    expect(body.metadata.rawFeedback).toBe("The model hallucinated a date")
    expect(body.feedback).toBe("The model hallucinated a date")

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(1)
    expect(persistedScores[0]?.source).toBe("annotation")
    expect(persistedScores[0]?.sourceId).toBe("API")
    expect(persistedScores[0]?.draftedAt).toBeNull()
  })

  it<ApiTestContext>("creates a draft annotation when draft=true is passed", async ({ app, database, clickhouse }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "ffffffffffffffffffffffff"
    const traceId = "99999999999999999999999999999999"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)
    await seedAnnotationTrace({
      clickhouse,
      organizationId: tenant.organizationId,
      projectId,
      traceId,
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 0.5,
          passed: true,
          feedback: "Mid-edit draft",
          trace: { by: "id", id: traceId },
          draft: true,
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(typeof body.draftedAt).toBe("string")
    expect(Number.isNaN(Date.parse(body.draftedAt as string))).toBe(false)

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(1)
    expect(persistedScores[0]?.draftedAt).toBeInstanceOf(Date)
  })

  it<ApiTestContext>("resolves a trace by filters when exactly one trace matches", async ({
    app,
    database,
    clickhouse,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "gggggggggggggggggggggggg"
    const traceId = "88888888888888888888888888888888"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)
    await seedAnnotationTrace({
      clickhouse,
      organizationId: tenant.organizationId,
      projectId,
      traceId,
      sessionId: "unique-filter-session",
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 1,
          passed: true,
          feedback: "Resolved by filter",
          trace: {
            by: "filters",
            filters: { sessionId: [{ op: "eq", value: "unique-filter-session" }] },
          },
        }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.traceId).toBe(traceId)
  })

  it<ApiTestContext>("returns 404 when trace filters resolve to zero traces", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "hhhhhhhhhhhhhhhhhhhhhhhh"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 0,
          passed: false,
          feedback: "Should not persist",
          trace: {
            by: "filters",
            filters: { sessionId: [{ op: "eq", value: "does-not-exist-session" }] },
          },
        }),
      }),
    )

    expect(response.status).toBe(404)

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))
    expect(persistedScores).toHaveLength(0)
  })

  it<ApiTestContext>("returns 400 when trace filters resolve to more than one trace", async ({
    app,
    database,
    clickhouse,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "iiiiiiiiiiiiiiiiiiiiiiii"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)
    await seedAnnotationTrace({
      clickhouse,
      organizationId: tenant.organizationId,
      projectId,
      traceId: "66666666666666666666666666666666",
      sessionId: "shared-ambiguous-session",
    })
    await seedAnnotationTrace({
      clickhouse,
      organizationId: tenant.organizationId,
      projectId,
      traceId: "77777777777777777777777777777777",
      sessionId: "shared-ambiguous-session",
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 0,
          passed: false,
          feedback: "Should not persist",
          trace: {
            by: "filters",
            filters: { sessionId: [{ op: "eq", value: "shared-ambiguous-session" }] },
          },
        }),
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain("more than one trace")
    expect(body.error).toContain("Refine the filter set")

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))
    expect(persistedScores).toHaveLength(0)
  })

  it<ApiTestContext>("creates annotation with anchor metadata", async ({ app, database, clickhouse }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)
    await seedAnnotationTrace({
      clickhouse,
      organizationId: tenant.organizationId,
      projectId,
      traceId: API_TEST_ANCHOR_TRACE_ID,
      inputMessages: [textMessage("user", "hello"), textMessage("assistant", "mid")],
      outputMessages: [textMessage("assistant", "01234567890123456789012345")],
    })

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 0.1,
          passed: false,
          feedback: "Wrong claim highlighted",
          trace: { by: "id", id: API_TEST_ANCHOR_TRACE_ID },
          anchor: {
            messageIndex: 2,
            partIndex: 0,
            startOffset: 10,
            endOffset: 25,
          },
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
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 2,
          passed: "not-a-bool",
          trace: { by: "id", id: "44444444444444444444444444444444" },
          feedback: "x",
        }),
      }),
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toHaveProperty("error")
    expect(typeof body.error).toBe("string")
    expect(body).not.toHaveProperty("success")

    const persistedScores = await database.db
      .select()
      .from(scoresTable)
      .where(eq(scoresTable.organizationId, tenant.organizationId))

    expect(persistedScores).toHaveLength(0)
  })

  it<ApiTestContext>("returns 404 for non-existent project", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const fakeProjectSlug = "nonexistent-project-slug"

    const response = await app.fetch(
      new Request(`http://localhost/v1/projects/${fakeProjectSlug}/annotations`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: 0.5,
          passed: true,
          feedback: "Good response",
          trace: { by: "id", id: "55555555555555555555555555555555" },
        }),
      }),
    )

    expect(response.status).toBe(404)
  })
})
