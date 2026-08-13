import { eq } from "@platform/db-postgres"
import { importJobs } from "@platform/db-postgres/schema/import-jobs"
import { projects } from "@platform/db-postgres/schema/projects"
import { createApiKeyAuthHeaders, type InMemoryPostgres } from "@platform/testkit"
import { describe, expect, it } from "vitest"
import {
  type ApiTestContext,
  createTenantSetup,
  REJECTED_CREDENTIAL_MARKER,
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

const LANGFUSE_CREDENTIALS = {
  kind: "langfuse",
  region: "eu",
  publicKey: "pk-lf-integration-test",
  secretKey: "sk-lf-integration-test",
} as const

interface ImportResponse {
  readonly id: string
  readonly projectId: string
  readonly source: string
  readonly status: string
  readonly config: {
    readonly sourceProjectId: string
    readonly sourceProjectName: string
    readonly sourceRegion: string
    readonly rangeFrom: string
    readonly rangeTo: string
    readonly maxTraces: number
    readonly sessionMetadataKey: string | null
  }
  readonly stats: { readonly tracesImported: number }
  readonly cancelledAt: string | null
  readonly runs?: readonly unknown[]
}

describe("Imports Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("creates, lists, gets, cancels, and retries an import", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "cccccccccccccccccccccccc")
    const headers = { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" }
    const base = `http://localhost/v1/projects/${slug}/imports`

    // Create with only the required fields → defaults fill the name, range and ceiling.
    const createRes = await app.fetch(
      new Request(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ credentials: LANGFUSE_CREDENTIALS, sourceProjectId: "lf-project-1" }),
      }),
    )
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as ImportResponse
    expect(created.source).toBe("langfuse")
    expect(created.status).toBe("queued")
    expect(created.config.sourceProjectName).toBe("lf-project-1")
    expect(created.config.sourceRegion).toBe("eu")
    expect(created.config.maxTraces).toBe(100_000)
    expect(created.config.sessionMetadataKey).toBeNull()
    expect(created.runs).toBeUndefined()

    // Credentials never appear on any response, in any shape.
    expect(JSON.stringify(created)).not.toContain(LANGFUSE_CREDENTIALS.secretKey)

    // Only one import runs at a time per organization.
    const conflictRes = await app.fetch(
      new Request(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ credentials: LANGFUSE_CREDENTIALS, sourceProjectId: "lf-project-2" }),
      }),
    )
    expect(conflictRes.status).toBe(409)

    // List → newest first, no run history.
    const listRes = await app.fetch(new Request(base, { headers }))
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as { imports: ImportResponse[] }
    expect(list.imports).toHaveLength(1)
    expect(list.imports[0]?.id).toBe(created.id)
    expect(list.imports[0]?.runs).toBeUndefined()

    // Get → includes the run history, empty for a job no worker has touched.
    const getRes = await app.fetch(new Request(`${base}/${created.id}`, { headers }))
    expect(getRes.status).toBe(200)
    const detail = (await getRes.json()) as ImportResponse
    expect(detail.id).toBe(created.id)
    expect(detail.runs).toEqual([])
    expect(JSON.stringify(detail)).not.toContain(LANGFUSE_CREDENTIALS.secretKey)

    // A queued job cannot be retried — it is still in flight.
    const earlyRetryRes = await app.fetch(
      new Request(`${base}/${created.id}/retry`, {
        method: "POST",
        headers,
        body: JSON.stringify({ credentials: LANGFUSE_CREDENTIALS }),
      }),
    )
    expect(earlyRetryRes.status).toBe(409)

    // Cancel → cooperative for a queued job: the request is stamped, the worker settles it.
    const cancelRes = await app.fetch(new Request(`${base}/${created.id}/cancel`, { method: "POST", headers }))
    expect(cancelRes.status).toBe(200)
    const cancelled = (await cancelRes.json()) as ImportResponse
    expect(cancelled.cancelledAt).not.toBeNull()

    // Settle the job as failed, as the worker would, so the retry path can run.
    await database.db
      .update(importJobs)
      .set({ status: "failed", credentials: null, error: "upstream broke", finishedAt: new Date() })
      .where(eq(importJobs.id, created.id))

    // Retry with credentials the platform rejects → fails fast, no retry recorded.
    const badRetryRes = await app.fetch(
      new Request(`${base}/${created.id}/retry`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          credentials: { ...LANGFUSE_CREDENTIALS, secretKey: `sk-lf-${REJECTED_CREDENTIAL_MARKER}` },
        }),
      }),
    )
    expect(badRetryRes.status).toBe(400)

    // Retry with credentials from another region → refused before anything is created.
    const mismatchRes = await app.fetch(
      new Request(`${base}/${created.id}/retry`, {
        method: "POST",
        headers,
        body: JSON.stringify({ credentials: { ...LANGFUSE_CREDENTIALS, region: "us" } }),
      }),
    )
    expect(mismatchRes.status).toBe(400)

    // Retry → a new import, queued, with the original's configuration.
    const retryRes = await app.fetch(
      new Request(`${base}/${created.id}/retry`, {
        method: "POST",
        headers,
        body: JSON.stringify({ credentials: LANGFUSE_CREDENTIALS }),
      }),
    )
    expect(retryRes.status).toBe(201)
    const retried = (await retryRes.json()) as ImportResponse
    expect(retried.id).not.toBe(created.id)
    expect(retried.status).toBe("queued")
    expect(retried.config.sourceProjectId).toBe(created.config.sourceProjectId)
  })

  it<ApiTestContext>("rejects a reversed range and hides other projects' imports", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "dddddddddddddddddddddddd")
    const otherSlug = await createProjectRecord(database, tenant.organizationId, "eeeeeeeeeeeeeeeeeeeeeeee")
    const headers = { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" }
    const base = `http://localhost/v1/projects/${slug}/imports`

    // Credentials the platform rejects fail the request; nothing is created.
    const badCredentialsRes = await app.fetch(
      new Request(base, {
        method: "POST",
        headers,
        body: JSON.stringify({
          credentials: { ...LANGFUSE_CREDENTIALS, secretKey: `sk-lf-${REJECTED_CREDENTIAL_MARKER}` },
          sourceProjectId: "lf-project-3",
        }),
      }),
    )
    expect(badCredentialsRes.status).toBe(400)
    const badCredentialsBody = (await badCredentialsRes.json()) as { error: string }
    expect(badCredentialsBody.error).toContain("connection test failed")

    const emptyListRes = await app.fetch(new Request(base, { headers }))
    expect(((await emptyListRes.json()) as { imports: unknown[] }).imports).toHaveLength(0)

    const reversedRes = await app.fetch(
      new Request(base, {
        method: "POST",
        headers,
        body: JSON.stringify({
          credentials: LANGFUSE_CREDENTIALS,
          sourceProjectId: "lf-project-3",
          rangeFrom: "2026-06-01T00:00:00Z",
          rangeTo: "2026-05-01T00:00:00Z",
        }),
      }),
    )
    expect(reversedRes.status).toBe(400)

    const createRes = await app.fetch(
      new Request(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ credentials: LANGFUSE_CREDENTIALS, sourceProjectId: "lf-project-3" }),
      }),
    )
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as ImportResponse

    // The import belongs to `slug`, so through the other project it does not exist.
    const crossGetRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${otherSlug}/imports/${created.id}`, { headers }),
    )
    expect(crossGetRes.status).toBe(404)

    const missingRes = await app.fetch(new Request(`${base}/aaaaaaaaaaaaaaaaaaaaaaaa`, { headers }))
    expect(missingRes.status).toBe(404)
  })
})
