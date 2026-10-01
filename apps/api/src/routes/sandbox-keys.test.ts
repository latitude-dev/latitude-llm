import { generateId, OrganizationId, ProjectId, SessionId, SpanId, TraceId } from "@domain/shared"
import { type SpanDetail, SpanRepository } from "@domain/spans"
import { stubListSpan } from "@domain/spans/testing"
import { SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createSandboxTenantSetup,
  createTenantSetup,
  setupTestApi,
} from "../test-utils/create-test-app.ts"

const SANDBOX_TRACE_ID = "33333333333333333333333333333333" as const
const SANDBOX_SPAN_ID = "3333333333333333" as const

const createProjectRecord = async (
  database: InMemoryPostgres,
  organizationId: string,
  projectId: string,
  slug: string,
): Promise<string> => {
  await database.db.insert(projects).values({
    id: projectId,
    organizationId,
    name: `Project ${projectId}`,
    slug,
  })
  return slug
}

const seedTrace = async ({
  clickhouse,
  organizationId,
  projectId,
  traceId,
  spanId,
}: {
  readonly clickhouse: ApiTestContext["clickhouse"]
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly spanId: string
}) => {
  const span: SpanDetail = {
    ...stubListSpan({
      organizationId: OrganizationId(organizationId),
      projectId: ProjectId(projectId),
      traceId: TraceId(traceId),
      sessionId: SessionId("sandbox-session"),
      spanId: SpanId(spanId),
      operation: "chat",
      startTime: new Date("2026-03-24T00:00:00.000Z"),
      endTime: new Date("2026-03-24T00:01:00.000Z"),
    }),
    inputMessages: [{ role: "user", parts: [{ type: "text", content: "hello from dev" }] }],
    outputMessages: [{ role: "assistant", parts: [{ type: "text", content: "hi" }] }],
    systemInstructions: [],
    toolDefinitions: [],
    toolCallId: "",
    toolName: "",
    toolInput: "",
    toolOutput: "",
  }

  await Effect.runPromise(
    Effect.gen(function* () {
      const spanRepository = yield* SpanRepository
      yield* spanRepository.insert([span])
    }).pipe(withClickHouse(SpanRepositoryLive, clickhouse, OrganizationId(organizationId))),
  )
}

/** Parent and sandbox orgs sharing one project slug, with the trace seeded in the sandbox only. */
const setupParentAndSandbox = async ({ database, clickhouse }: Pick<ApiTestContext, "database" | "clickhouse">) => {
  const parent = await createTenantSetup(database)
  const sandbox = await createSandboxTenantSetup(database, parent)

  const slug = "agent-app"
  await createProjectRecord(database, parent.organizationId, generateId(), slug)
  const sandboxProjectId = generateId()
  await createProjectRecord(database, sandbox.organizationId, sandboxProjectId, slug)

  await seedTrace({
    clickhouse,
    organizationId: sandbox.organizationId,
    projectId: sandboxProjectId,
    traceId: SANDBOX_TRACE_ID,
    spanId: SANDBOX_SPAN_ID,
  })

  return { parent, sandbox, slug }
}

const listTraces = (app: ApiTestContext["app"], slug: string, token: string) =>
  app.fetch(
    new Request(`http://localhost/v1/projects/${slug}/traces/list`, {
      method: "POST",
      headers: { ...createApiKeyAuthHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  )

describe("Sandbox API key access", () => {
  setupTestApi()

  it<ApiTestContext>("lists a sandbox's traces when authenticated with its lat_sandbox_ key", async ({
    app,
    database,
    clickhouse,
  }) => {
    const { sandbox, slug } = await setupParentAndSandbox({ database, clickhouse })

    const res = await listTraces(app, slug, sandbox.apiKeyToken)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: { traceId: string }[] }
    expect(body.items.map((item) => item.traceId)).toEqual([SANDBOX_TRACE_ID])
  })

  it<ApiTestContext>("returns a sandbox trace's detail and spans to its lat_sandbox_ key", async ({
    app,
    database,
    clickhouse,
  }) => {
    const { sandbox, slug } = await setupParentAndSandbox({ database, clickhouse })
    const headers = createApiKeyAuthHeaders(sandbox.apiKeyToken)

    const traceRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/${SANDBOX_TRACE_ID}`, { headers }),
    )
    expect(traceRes.status).toBe(200)

    const spansRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/traces/${SANDBOX_TRACE_ID}/spans`, { headers }),
    )
    expect(spansRes.status).toBe(200)
    const spans = (await spansRes.json()) as { items: { spanId: string }[] }
    expect(spans.items.map((span) => span.spanId)).toContain(SANDBOX_SPAN_ID)
  })

  it<ApiTestContext>("hides sandbox traces from the parent org's live key — an empty page, not an error", async ({
    app,
    database,
    clickhouse,
  }) => {
    const { parent, slug } = await setupParentAndSandbox({ database, clickhouse })

    const res = await listTraces(app, slug, parent.apiKeyToken)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it<ApiTestContext>("returns 404 when the sandbox key asks for a project that only exists live", async ({
    app,
    database,
    clickhouse,
  }) => {
    const { parent, sandbox } = await setupParentAndSandbox({ database, clickhouse })
    const liveOnlySlug = "live-only"
    await createProjectRecord(database, parent.organizationId, generateId(), liveOnlySlug)

    const res = await listTraces(app, liveOnlySlug, sandbox.apiKeyToken)

    expect(res.status).toBe(404)
  })
})
