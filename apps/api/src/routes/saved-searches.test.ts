import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createOAuthAuthHeaders,
  createOAuthTenantSetup,
  createTenantSetup,
  setupTestApi,
} from "../test-utils/create-test-app.ts"

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

describe("Saved Searches Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET / rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/searches"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET / returns an empty paginated page when no searches exist", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/searches`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("POST / rejects API-key callers with 403 (OAuth-only)", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/searches`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "My search", query: "latency > 1s" }),
      }),
    )

    expect(res.status).toBe(403)
  })

  it<ApiTestContext>("POST / creates a saved search for OAuth callers (201 with full payload)", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "cccccccccccccccccccccccc"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/searches`, {
        method: "POST",
        headers: {
          ...createOAuthAuthHeaders(tenant.oauthAccessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "High-cost traces", query: "expensive" }),
      }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      id: string
      slug: string
      name: string
      query: string | null
      createdByUserId: string
    }
    expect(body.name).toBe("High-cost traces")
    expect(body.slug).toMatch(/^high-cost-traces/)
    expect(body.query).toBe("expensive")
    expect(body.createdByUserId).toBe(tenant.userId)
  })

  it<ApiTestContext>("POST / rejects an empty search (no query, no filters) with 400", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "dddddddddddddddddddddddd"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/searches`, {
        method: "POST",
        headers: {
          ...createOAuthAuthHeaders(tenant.oauthAccessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Empty" }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{searchSlug} returns 404 for a non-existent search", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "eeeeeeeeeeeeeeeeeeeeeeee"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/searches/does-not-exist`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{searchSlug} returns a previously-created search", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "ffffffffffffffffffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const createRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/searches`, {
        method: "POST",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Errors only", query: "errored=true" }),
      }),
    )
    const created = (await createRes.json()) as { slug: string }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/searches/${created.slug}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string }
    expect(body.name).toBe("Errors only")
  })

  it<ApiTestContext>("PATCH /{searchSlug} renames the search and regenerates the slug", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "1111111111111111aaaaaaaa"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)

    const createRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches`, {
        method: "POST",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Initial", query: "foo" }),
      }),
    )
    const created = (await createRes.json()) as { slug: string }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches/${created.slug}`, {
        method: "PATCH",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed Search" }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; slug: string }
    expect(body.name).toBe("Renamed Search")
    expect(body.slug).toMatch(/^renamed-search/)
  })

  it<ApiTestContext>("DELETE /{searchSlug} deletes the saved search (204)", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "2222222222222222aaaaaaaa"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)

    const createRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches`, {
        method: "POST",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "To delete", query: "bar" }),
      }),
    )
    const created = (await createRes.json()) as { slug: string }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches/${created.slug}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(204)

    const getRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches/${created.slug}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(getRes.status).toBe(404)
  })

  it<ApiTestContext>("POST /{searchSlug}/assign rejects an assignee that isn't an org member", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "3333333333333333aaaaaaaa"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)

    const createRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches`, {
        method: "POST",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Assignable", query: "foo" }),
      }),
    )
    const created = (await createRes.json()) as { slug: string }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches/${created.slug}/assign`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "x".repeat(24) }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{searchSlug}/traces returns an empty paginated page when no traces match", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "5555555555555555aaaaaaaa"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)

    const createRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches`, {
        method: "POST",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No matches", query: "foo" }),
      }),
    )
    const created = (await createRes.json()) as { slug: string }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches/${created.slug}/traces`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("GET /{searchSlug}/traces rejects a malformed cursor with 400", async ({ app, database }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "6666666666666666aaaaaaaa"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)

    const createRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches`, {
        method: "POST",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bad cursor target", query: "foo" }),
      }),
    )
    const created = (await createRes.json()) as { slug: string }

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/projects/${projectSlug}/searches/${created.slug}/traces?cursor=not-a-valid-cursor`,
        { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) },
      ),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{searchSlug}/traces returns 404 when the saved search doesn't exist", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "7777777777777777aaaaaaaa"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches/missing-search/traces`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("POST /{searchSlug}/assign assigns to a member and clears with null", async ({
    app,
    database,
  }) => {
    const tenant = await createOAuthTenantSetup(database)
    const projectId = "4444444444444444aaaaaaaa"
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectId)

    const createRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches`, {
        method: "POST",
        headers: { ...createOAuthAuthHeaders(tenant.oauthAccessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Assign me", query: "foo" }),
      }),
    )
    const created = (await createRes.json()) as { slug: string }

    const assignRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches/${created.slug}/assign`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ userId: tenant.userId }),
      }),
    )

    expect(assignRes.status).toBe(200)
    const assignedBody = (await assignRes.json()) as { assignedUserId: string | null }
    expect(assignedBody.assignedUserId).toBe(tenant.userId)

    const clearRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/searches/${created.slug}/assign`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ userId: null }),
      }),
    )

    expect(clearRes.status).toBe(200)
    const clearedBody = (await clearRes.json()) as { assignedUserId: string | null }
    expect(clearedBody.assignedUserId).toBeNull()
  })
})
