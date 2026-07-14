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

interface ExperimentResponse {
  readonly slug: string
  readonly name: string
  readonly variants: ReadonlyArray<{ id: string; name: string; baseline: boolean }>
}

interface ComparisonResponse {
  readonly experiment: ExperimentResponse
  readonly variants: ReadonlyArray<{
    variantId: string
    baseline: boolean
    approximate: boolean
    resolvedRange: { fromIso: string; toIso: string }
    metrics: { values: Record<string, number | null> }
    deltas: Record<string, number | "up-from-zero" | null>
    deviatingPopulationKeys: string[]
  }>
}

describe("Experiments Routes Integration", () => {
  setupTestApi()

  it<ApiTestContext>("creates, lists, compares, updates, and deletes an experiment", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "aaaaaaaaaaaaaaaaaaaaaaaa")
    const headers = { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" }
    const base = `http://localhost/v1/projects/${slug}/experiments`

    // Create with no variants → seeds the two default variants (Variant A baseline + Variant B).
    const createRes = await app.fetch(
      new Request(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Checkout comparison", description: "Created from API QA" }),
      }),
    )
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as ExperimentResponse
    expect(created.slug).toBe("checkout-comparison")
    expect(created.variants).toHaveLength(2)
    expect(created.variants.filter((variant) => variant.baseline)).toHaveLength(1)
    expect(created.variants.map((variant) => variant.name)).toEqual(["Variant A", "Variant B"])

    // List → includes the experiment with cheap summary columns.
    const listRes = await app.fetch(new Request(base, { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }))
    expect(listRes.status).toBe(200)
    const list = (await listRes.json()) as {
      items: Array<{ slug: string; variantCount: number; sessionsDistinct: number; usersDistinct: number }>
      hasMore: boolean
    }
    const row = list.items.find((item) => item.slug === created.slug)
    expect(row).toBeDefined()
    expect(row?.variantCount).toBe(2)
    expect(row?.sessionsDistinct).toBe(0)
    expect(row?.usersDistinct).toBe(0)

    // Get → the comparison bundle: per-variant metrics, baseline first, deltas present.
    const getRes = await app.fetch(
      new Request(`${base}/${created.slug}`, { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }),
    )
    expect(getRes.status).toBe(200)
    const comparison = (await getRes.json()) as ComparisonResponse
    expect(comparison.experiment.slug).toBe(created.slug)
    expect(comparison.variants).toHaveLength(2)
    expect(comparison.variants[0]?.baseline).toBe(true)
    expect(comparison.variants[0]?.metrics.values["sessions.count"]).toBe(0)
    expect(comparison.variants[0]?.resolvedRange.fromIso).toBeDefined()
    expect(comparison.variants[0]?.approximate).toBe(false)

    // Update → rename + replace the variants with a single baseline.
    const updateRes = await app.fetch(
      new Request(`${base}/${created.slug}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: "Checkout comparison v2",
          variants: [{ name: "Only", baseline: true, filterSet: {}, query: null, timeRange: null }],
        }),
      }),
    )
    expect(updateRes.status).toBe(200)
    const updated = (await updateRes.json()) as ExperimentResponse
    expect(updated.slug).toBe("checkout-comparison-v2")
    expect(updated.variants).toHaveLength(1)
    expect(updated.variants[0]?.baseline).toBe(true)

    // Delete → 204, then the slug 404s.
    const deleteRes = await app.fetch(
      new Request(`${base}/${updated.slug}`, {
        method: "DELETE",
        headers: createApiKeyAuthHeaders(tenant.apiKeyToken),
      }),
    )
    expect(deleteRes.status).toBe(204)

    const getDeletedRes = await app.fetch(
      new Request(`${base}/${updated.slug}`, { headers: createApiKeyAuthHeaders(tenant.apiKeyToken) }),
    )
    expect(getDeletedRes.status).toBe(404)
  })

  it<ApiTestContext>("rejects duplicate variant names", async ({ app, database }) => {
    const tenant = await createTenantSetup(database)
    const slug = await createProjectRecord(database, tenant.organizationId, "bbbbbbbbbbbbbbbbbbbbbbbb")

    const res = await app.fetch(
      new Request(`http://localhost/v1/projects/${slug}/experiments`, {
        method: "POST",
        headers: { ...createApiKeyAuthHeaders(tenant.apiKeyToken), "content-type": "application/json" },
        body: JSON.stringify({
          name: "Dupe experiment",
          variants: [
            { name: "Same", baseline: true, filterSet: {}, query: null, timeRange: null },
            { name: "Same", baseline: false, filterSet: {}, query: null, timeRange: null },
          ],
        }),
      }),
    )

    expect(res.status).toBe(400)
  })
})
