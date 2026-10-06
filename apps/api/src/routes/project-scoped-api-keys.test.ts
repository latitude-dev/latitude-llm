import { generateId } from "@domain/shared"
import { apiKeys } from "@platform/db-postgres/schema/api-keys"
import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { encrypt, hash } from "@repo/utils"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createTenantSetup,
  setupTestApi,
  TEST_ENCRYPTION_KEY,
} from "../test-utils/create-test-app.ts"

const createProjectRecord = async (database: InMemoryPostgres, organizationId: string, name: string) => {
  const id = generateId()
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id.slice(0, 6)}`
  await database.db.insert(projects).values({ id, organizationId, name, slug })
  return { id, slug }
}

const createScopedKey = async (database: InMemoryPostgres, organizationId: string, projectId: string) => {
  const token = crypto.randomUUID()
  const id = generateId()
  const tokenHash = await Effect.runPromise(hash(token))
  const encryptedToken = await Effect.runPromise(encrypt(token, TEST_ENCRYPTION_KEY))
  await database.db.insert(apiKeys).values({
    id,
    organizationId,
    projectId,
    token: encryptedToken,
    tokenHash,
    name: "project-key",
  })
  return { id, token }
}

describe("Project-scoped API keys", () => {
  setupTestApi()

  it<ApiTestContext>("POST /v1/api-keys binds a key to a project slug and lists the scope", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const project = await createProjectRecord(database, tenant.organizationId, "Scoped")

    const created = await app.fetch(
      new Request("http://localhost/v1/api-keys", {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "proj-key", projectSlug: project.slug }),
      }),
    )
    expect(created.status).toBe(201)
    const body = (await created.json()) as {
      scope: string
      projectId: string
      projectSlug: string
      name: string
    }
    expect(body.name).toBe("proj-key")
    expect(body.scope).toBe("project")
    expect(body.projectId).toBe(project.id)
    expect(body.projectSlug).toBe(project.slug)

    const listed = await app.fetch(
      new Request("http://localhost/v1/api-keys", { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }),
    )
    expect(listed.status).toBe(200)
    const listBody = (await listed.json()) as {
      apiKeys: ReadonlyArray<{ name: string; scope: string; projectId: string | null }>
    }
    const orgKey = listBody.apiKeys.find((key) => key.name === "auth-key")
    const projectKey = listBody.apiKeys.find((key) => key.name === "proj-key")
    expect(orgKey?.scope).toBe("organization")
    expect(orgKey?.projectId).toBeNull()
    expect(projectKey?.scope).toBe("project")
    expect(projectKey?.projectId).toBe(project.id)
  })

  it<ApiTestContext>("a project-scoped key is 403 on org routes and 404 on another project", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const own = await createProjectRecord(database, tenant.organizationId, "Own")
    const other = await createProjectRecord(database, tenant.organizationId, "Other")
    const scoped = await createScopedKey(database, tenant.organizationId, own.id)
    const headers = createApiKeyAuthHeaders(scoped.token)

    const orgList = await app.fetch(new Request("http://localhost/v1/projects", { headers }))
    expect(orgList.status).toBe(403)

    const orgKeys = await app.fetch(new Request("http://localhost/v1/api-keys", { headers }))
    expect(orgKeys.status).toBe(403)

    const ownProject = await app.fetch(new Request(`http://localhost/v1/projects/${own.slug}`, { headers }))
    expect(ownProject.status).toBe(200)

    const otherProject = await app.fetch(new Request(`http://localhost/v1/projects/${other.slug}`, { headers }))
    expect(otherProject.status).toBe(404)

    const missing = await app.fetch(new Request("http://localhost/v1/projects/does-not-exist", { headers }))
    expect(missing.status).toBe(404)

    const orgWide = await app.fetch(
      new Request("http://localhost/v1/projects", { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }),
    )
    expect(orgWide.status).toBe(200)
  })
})
