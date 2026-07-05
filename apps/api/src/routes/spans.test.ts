import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import { type ApiTestContext, createTenantSetup, setupTestApi } from "../test-utils/create-test-app.ts"

const createProjectRecord = async (
  database: InMemoryPostgres,
  organizationId: string,
  projectId: string,
): Promise<string> => {
  const slug = `project-${projectId.slice(0, 8)}`
  await database.db.insert(projects).values({ id: projectId, organizationId, name: `Project ${projectId}`, slug })
  return slug
}

const RANGE = { fromIso: "2026-06-01T00:00:00.000Z", toIso: "2026-06-08T00:00:00.000Z" }

// Mirrors the route's opaque keyset-cursor encoding so tests can mint cursors.
const encodeCursor = (c: { f: string; d: string; v: string; s: string }): string =>
  Buffer.from(JSON.stringify(c), "utf8").toString("base64url")

const START_TIME_DESC_CURSOR = encodeCursor({
  f: "startTime",
  d: "desc",
  v: "2026-06-01 00:00:00.000000000",
  s: "1111111111111111",
})

describe("Spans Routes Integration", () => {
  setupTestApi()

  const post = (app: ApiTestContext["app"], slug: string, body: unknown, token?: string) =>
    app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/spans/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? createApiKeyAuthHeaders(token) : {}) },
        body: JSON.stringify(body),
      }),
    )

  it<ApiTestContext>("rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await post(app, "foo", {})
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("returns a paginated page for a valid query", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "aaaaaaaaaaaaaaaaaaaaaaaa")
    const res = await post(
      app,
      slug,
      { filters: { operation: [{ op: "eq", value: "chat" }] }, range: RANGE },
      tenant.apiKeyToken,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.hasMore).toBe(false)
    expect(body.nextCursor).toBeNull()
  })

  it<ApiTestContext>("accepts a well-formed cursor that matches the ordering", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "bbbbbbbbbbbbbbbbbbbbbbbb")
    // Default ordering is startTime desc, which the cursor was minted under.
    const res = await post(app, slug, { cursor: START_TIME_DESC_CURSOR }, tenant.apiKeyToken)
    expect(res.status).toBe(200)
  })

  describe("validation (400)", () => {
    // Cursor/range checks run before the project lookup, so these need auth but no
    // project record — which also avoids a projects_pkey clash across cases.
    const cases: Array<{ name: string; body: unknown }> = [
      { name: "undecodable cursor", body: { cursor: "!!!not-a-cursor!!!" } },
      {
        name: "cursor with an unknown sort field",
        body: { cursor: encodeCursor({ f: "nope", d: "desc", v: "x", s: "1111111111111111" }) },
      },
      {
        name: "cursor whose field disagrees with orderBy",
        body: { orderBy: { field: "duration", direction: "desc" }, cursor: START_TIME_DESC_CURSOR },
      },
      {
        name: "cursor whose direction disagrees with orderBy",
        body: { orderBy: { field: "startTime", direction: "asc" }, cursor: START_TIME_DESC_CURSOR },
      },
      { name: "inverted range", body: { range: { fromIso: RANGE.toIso, toIso: RANGE.fromIso } } },
      { name: "empty range (fromIso === toIso)", body: { range: { fromIso: RANGE.fromIso, toIso: RANGE.fromIso } } },
      { name: "limit over the cap", body: { limit: 100_000 } },
    ]

    for (const { name, body } of cases) {
      it<ApiTestContext>(`rejects ${name} with 400`, async ({ app, database }) => {
        const tenant = await createTenantSetup(database)
        const res = await post(app, "any-project", body, tenant.apiKeyToken)
        expect(res.status).toBe(400)
      })
    }
  })
})
