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

describe("Analytics Routes Integration", () => {
  setupTestApi()

  const post = (app: ApiTestContext["app"], slug: string, body: unknown, token?: string) =>
    app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/analytics/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? createApiKeyAuthHeaders(token) : {}) },
        body: JSON.stringify(body),
      }),
    )

  it<ApiTestContext>("rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await post(app, "foo", { stream: "traces", metric: { kind: "count" }, range: RANGE })
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("returns a series for a valid metric-only query", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "aaaaaaaaaaaaaaaaaaaaaaaa")
    const res = await post(app, slug, { stream: "traces", metric: { kind: "count" }, range: RANGE }, tenant.apiKeyToken)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { series: { value: number }[] }
    expect(Array.isArray(body.series)).toBe(true)
  })

  describe("validation (400)", () => {
    const cases: Array<{ name: string; body: unknown }> = [
      {
        name: "unknown breakdown for traces",
        body: { stream: "traces", metric: { kind: "count" }, breakdown: "country", range: RANGE },
      },
      {
        name: "traces-only breakdown (`name`) on sessions",
        body: { stream: "sessions", metric: { kind: "count" }, breakdown: "name", range: RANGE },
      },
      {
        name: "semantic query on spans",
        body: { stream: "spans", metric: { kind: "count" }, query: "refund", range: RANGE },
      },
      {
        name: "gtePercentile on spans stream row filters",
        body: {
          stream: "spans",
          metric: { kind: "count" },
          filters: { duration: [{ op: "gtePercentile", value: 90 }] },
          range: RANGE,
        },
      },
      {
        name: "inverted range",
        body: { stream: "traces", metric: { kind: "count" }, range: { fromIso: RANGE.toIso, toIso: RANGE.fromIso } },
      },
      {
        name: "empty range (fromIso === toIso)",
        body: { stream: "traces", metric: { kind: "count" }, range: { fromIso: RANGE.fromIso, toIso: RANGE.fromIso } },
      },
      {
        name: "limit over the cap",
        body: { stream: "traces", metric: { kind: "count" }, range: RANGE, limit: 100_000 },
      },
    ]

    // Body validation runs before the project lookup, so these need auth but no
    // project record — which also avoids a projects_pkey clash across cases.
    for (const { name, body } of cases) {
      it<ApiTestContext>(`rejects ${name} with 400`, async ({ app, database }) => {
        const tenant = await createTenantSetup(database)
        const res = await post(app, "any-project", body, tenant.apiKeyToken)
        expect(res.status).toBe(400)
      })
    }
  })
})
