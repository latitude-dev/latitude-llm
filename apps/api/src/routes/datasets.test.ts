import { DATASET_DOWNLOAD_DIRECT_THRESHOLD } from "@domain/datasets"
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
  await database.db.insert(projects).values({
    id: projectId,
    organizationId,
    name: `Project ${projectId}`,
    slug,
  })
  return slug
}

describe("Datasets Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("GET / rejects unauthenticated requests with 401", async ({ app }) => {
    const res = await app.fetch(new Request("http://localhost/v1/projects/foo/datasets"))
    expect(res.status).toBe(401)
  })

  it<ApiTestContext>("GET / returns an empty paginated page when no datasets exist", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("POST / creates a dataset and derives a slug from the name", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Customer Feedback", description: "First-line support tickets" }),
      }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; name: string; slug: string; description: string | null }
    expect(body.name).toBe("Customer Feedback")
    expect(body.slug).toBe("customer-feedback")
    expect(body.description).toBe("First-line support tickets")
  })

  it<ApiTestContext>("POST / rejects an empty `name` with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "cccccccccccccccccccccccc"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "" }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("GET /{datasetSlug} returns 404 for a non-existent dataset", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "dddddddddddddddddddddddd"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets/missing`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("GET /{datasetSlug} returns the dataset after create", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "eeeeeeeeeeeeeeeeeeeeeeee"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const created = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        method: "POST",
        headers: {
          ...createApiKeyAuthHeaders(tenant.apiKeyToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Eval Outputs" }),
      }),
    )
    const createdBody = (await created.json()) as { id: string; slug: string }

    const fetched = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets/${createdBody.slug}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(fetched.status).toBe(200)
    const body = (await fetched.json()) as { id: string; slug: string; name: string }
    expect(body.id).toBe(createdBody.id)
    expect(body.name).toBe("Eval Outputs")
    expect(body.slug).toBe("eval-outputs")
  })

  it<ApiTestContext>("PATCH /{datasetSlug} renames the dataset and regenerates the slug", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "ffffffffffffffffffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const created = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Original Name" }),
      }),
    )
    const originalBody = (await created.json()) as { slug: string; id: string }
    expect(originalBody.slug).toBe("original-name")

    const renamed = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets/${originalBody.slug}`, {
        method: "PATCH",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed Dataset" }),
      }),
    )

    expect(renamed.status).toBe(200)
    const renamedBody = (await renamed.json()) as { id: string; slug: string; name: string }
    expect(renamedBody.id).toBe(originalBody.id)
    expect(renamedBody.name).toBe("Renamed Dataset")
    expect(renamedBody.slug).toBe("renamed-dataset")

    // Old slug is gone; new slug resolves the same dataset.
    const oldLookup = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets/${originalBody.slug}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(oldLookup.status).toBe(404)
  })

  it<ApiTestContext>("PATCH /{datasetSlug} updates description only without changing the slug", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "1111111111111111ffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const created = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Stable Dataset" }),
      }),
    )
    const originalBody = (await created.json()) as { slug: string }

    const patched = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets/${originalBody.slug}`, {
        method: "PATCH",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Captured during onboarding" }),
      }),
    )

    expect(patched.status).toBe(200)
    const body = (await patched.json()) as { slug: string; description: string | null; name: string }
    expect(body.slug).toBe("stable-dataset")
    expect(body.description).toBe("Captured during onboarding")
    expect(body.name).toBe("Stable Dataset")
  })

  it<ApiTestContext>("PATCH /{datasetSlug} rejects an empty body with 400", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "2222222222222222ffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const created = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Anything" }),
      }),
    )
    const originalBody = (await created.json()) as { slug: string }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets/${originalBody.slug}`, {
        method: "PATCH",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("DELETE /{datasetSlug} soft-deletes the dataset and frees the slug for reuse", async ({
    app,
    database,
  }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "3333333333333333ffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    const created = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "To Delete" }),
      }),
    )
    const originalBody = (await created.json()) as { slug: string }

    const deleted = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets/${originalBody.slug}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(deleted.status).toBe(204)

    const after = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets/${originalBody.slug}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(after.status).toBe(404)

    // Slug is reusable after soft-delete.
    const recreated = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "To Delete" }),
      }),
    )
    expect(recreated.status).toBe(201)
    const recreatedBody = (await recreated.json()) as { slug: string }
    expect(recreatedBody.slug).toBe("to-delete")
  })

  it<ApiTestContext>("GET / returns created datasets, newest first by default", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const projectId = "4444444444444444ffffffff"
    const slug = await createProjectRecord(database, tenant.organizationId, projectId)

    for (const name of ["First", "Second", "Third"]) {
      const r = await app.fetch(
        new Request(`http://localhost/v1/projects/${slug}/datasets`, {
          method: "POST",
          headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      )
      expect(r.status).toBe(201)
    }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/datasets`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: ReadonlyArray<{ name: string }> }
    expect(body.items.map((d) => d.name)).toEqual(["Third", "Second", "First"])
  })

  // ─── Rows ──────────────────────────────────────────────────────────────────

  const createDatasetForRows = async (
    app: ApiTestContext["app"],
    database: InMemoryPostgres,
    projectIdToUse: string,
    name: string,
  ): Promise<{
    readonly tenant: Awaited<ReturnType<typeof createTenantSetup>>
    readonly projectSlug: string
    readonly datasetSlug: string
  }> => {
    const tenant = await createTenantSetup(database)
    const projectSlug = await createProjectRecord(database, tenant.organizationId, projectIdToUse)
    const created = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    )
    expect(created.status).toBe(201)
    const body = (await created.json()) as { slug: string }
    return { tenant, projectSlug, datasetSlug: body.slug }
  }

  it<ApiTestContext>("GET /{datasetSlug}/rows returns an empty page on a fresh dataset", async ({ app, database }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "5555555555555555ffffffff",
      "Empty Rows",
    )

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[]; nextCursor: string | null; hasMore: boolean }
    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(body.hasMore).toBe(false)
  })

  it<ApiTestContext>("POST /{datasetSlug}/rows inserts rows and bumps the version", async ({ app, database }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "6666666666666666ffffffff",
      "Insert Rows",
    )

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { input: "what is two plus two", output: "four" },
            { input: { question: "weather" }, output: { answer: "sunny" }, metadata: { topic: "weather" } },
          ],
        }),
      }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as { versionId: string; version: number; rowIds: string[] }
    expect(body.rowIds).toHaveLength(2)
    expect(body.version).toBeGreaterThan(0)
    expect(body.versionId).toMatch(/^.+$/)

    const detail = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}`, {
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    const datasetBody = (await detail.json()) as { version: number }
    expect(datasetBody.version).toBe(body.version)
  })

  it<ApiTestContext>("POST /{datasetSlug}/rows rejects an empty rows array with 400", async ({ app, database }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "7777777777777777ffffffff",
      "Empty Insert",
    )

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("DELETE /{datasetSlug}/rows with `mode: all` clears the dataset and reports deletedCount", async ({
    app,
    database,
  }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "8888888888888888ffffffff",
      "Delete All",
    )

    await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { input: "a", output: "1" },
            { input: "b", output: "2" },
            { input: "c", output: "3" },
          ],
        }),
      }),
    )

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows`, {
        method: "DELETE",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ selection: { mode: "all" } }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { versionId: string | null; version: number; deletedCount?: number }
    expect(body.deletedCount).toBe(3)
    expect(body.versionId).not.toBeNull()
  })

  it<ApiTestContext>("DELETE /{datasetSlug}/rows with `mode: selected` and an empty list is a no-op", async ({
    app,
    database,
  }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "9999999999999999ffffffff",
      "Noop Delete",
    )

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows`, {
        method: "DELETE",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ selection: { mode: "selected", rowIds: ["aaaaaaaaaaaaaaaaaaaaaaaa"] } }),
      }),
    )

    // Selected delete on a non-existent row id surfaces a 404 (row lookup before delete).
    expect(res.status).toBe(404)
  })

  it<ApiTestContext>("POST /{datasetSlug}/rows/export returns 200 ready with a signed URL for a small dataset (no recipient needed)", async ({
    app,
    database,
    storageDisk,
  }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "aaaaaaaaaaaa1111aaaaaaaa",
      "Export Small",
    )

    // Seed a couple of rows so the export has content.
    const insertRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { input: "a", output: "1" },
            { input: "b", output: "2" },
          ],
        }),
      }),
    )
    expect(insertRes.status).toBe(201)
    const filesBefore = storageDisk.files.size

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows/export`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      downloadUrl: string
      filename: string
      expiresAt: string
      rowCount: number
    }
    expect(body.status).toBe("ready")
    expect(body.filename).toBe("Export_Small.csv")
    expect(body.rowCount).toBe(2)
    expect(body.downloadUrl).toMatch(/^https:\/\/download\.test\//)
    expect(storageDisk.files.size).toBe(filesBefore + 1)
  })

  it<ApiTestContext>("POST /{datasetSlug}/rows/export still goes the synchronous path when the dataset is small and a `recipient` is supplied (recipient is ignored)", async ({
    app,
    database,
    storageDisk,
  }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "aaaaaaaaaaaa2222aaaaaaaa",
      "Export Small Recipient",
    )

    const insertRes = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [{ input: "a", output: "1" }] }),
      }),
    )
    expect(insertRes.status).toBe(201)
    const filesBefore = storageDisk.files.size

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows/export`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        // Recipient is set but the dataset is small — the sync path should win.
        body: JSON.stringify({ recipient: `${tenant.userId}@example.com` }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; downloadUrl: string; rowCount: number }
    expect(body.status).toBe("ready")
    expect(body.rowCount).toBe(1)
    expect(body.downloadUrl).toMatch(/^https:\/\/download\.test\//)
    // The CSV was still uploaded; no email queue work happened.
    expect(storageDisk.files.size).toBe(filesBefore + 1)
  })

  it<ApiTestContext>("POST /{datasetSlug}/rows/export returns 413 too_large with an LLM-readable recommendedAction when the export is too big and no `recipient` is provided", async ({
    app,
    database,
    storageDisk,
  }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "bbbbbbbbbbbb1111aaaaaaaa",
      "Export Big",
    )

    const filesBefore = storageDisk.files.size
    const oversizedRowCount = DATASET_DOWNLOAD_DIRECT_THRESHOLD + 1
    const oversizedSelection = {
      mode: "selected" as const,
      rowIds: Array.from({ length: oversizedRowCount }, (_, i) => `r${i}`.padEnd(24, "0")),
    }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows/export`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ selection: oversizedSelection }),
      }),
    )

    expect(res.status).toBe(413)
    const body = (await res.json()) as {
      status: string
      rowCount: number
      threshold: number
      recommendedAction: string
    }
    expect(body.status).toBe("too_large")
    expect(body.rowCount).toBe(oversizedRowCount)
    expect(body.threshold).toBe(DATASET_DOWNLOAD_DIRECT_THRESHOLD)
    expect(body.recommendedAction).toMatch(/recipient/)
    expect(body.recommendedAction).toMatch(/email/)
    expect(storageDisk.files.size).toBe(filesBefore)
  })

  it<ApiTestContext>("POST /{datasetSlug}/rows/export queues the email flow when the export is too big and `recipient` is an org member", async ({
    app,
    database,
    storageDisk,
  }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "cccccccccccc1111aaaaaaaa",
      "Export Queued",
    )

    const filesBefore = storageDisk.files.size
    const oversizedRowCount = DATASET_DOWNLOAD_DIRECT_THRESHOLD + 1
    const oversizedSelection = {
      mode: "selected" as const,
      rowIds: Array.from({ length: oversizedRowCount }, (_, i) => `r${i}`.padEnd(24, "0")),
    }

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows/export`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: `${tenant.userId}@example.com`,
          selection: oversizedSelection,
        }),
      }),
    )

    expect(res.status).toBe(202)
    const body = (await res.json()) as { status: string; recipient: string; rowCount: number }
    expect(body.status).toBe("queued")
    expect(body.recipient).toBe(`${tenant.userId}@example.com`)
    expect(body.rowCount).toBe(oversizedRowCount)
    // The 413 path counted but did not upload; the queued path does not upload either.
    expect(storageDisk.files.size).toBe(filesBefore)
  })

  it<ApiTestContext>("POST /{datasetSlug}/rows/export rejects a non-member recipient with 400", async ({
    app,
    database,
  }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "dddddddddddd2222aaaaaaaa",
      "Export Stranger",
    )

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows/export`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: "stranger@example.com" }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST /{datasetSlug}/rows/export validates `recipient` shape with 400", async ({
    app,
    database,
  }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "eeeeeeeeeeee2222aaaaaaaa",
      "Export Validate",
    )

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows/export`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: "not-an-email" }),
      }),
    )

    expect(res.status).toBe(400)
  })

  it<ApiTestContext>("POST /{datasetSlug}/rows/import/traces with an empty id list resolves to 201 + zero rows", async ({
    app,
    database,
  }) => {
    const { tenant, projectSlug, datasetSlug } = await createDatasetForRows(
      app,
      database,
      "dddddddddddd1111aaaaaaaa",
      "Import Traces",
    )

    // Empty filter set produces no resolved trace ids in the ClickHouse test
    // double, so the importer short-circuits to the empty-result branch.
    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${projectSlug}/datasets/${datasetSlug}/rows/import/traces`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "Content-Type": "application/json" },
        body: JSON.stringify({ traces: { by: "filters", filters: {} } }),
      }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as { rowIds: string[] }
    expect(body.rowIds).toEqual([])
  })
})
