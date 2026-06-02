import { DatasetId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Dataset } from "../entities/dataset.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { createFakeDatasetRepository } from "../testing/fake-dataset-repository.ts"
import { searchDatasets } from "./search-datasets.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectA = ProjectId("a".repeat(24))
const projectB = ProjectId("b".repeat(24))

const inertSqlClient = {
  organizationId,
  transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  query: () => Effect.die("SqlClient.query should not be called"),
}

const makeDataset = (id: string, projectId: ProjectId, name: string): Dataset => ({
  id: DatasetId(id.padEnd(24, "0")),
  organizationId,
  projectId,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  description: null,
  fileKey: null,
  currentVersion: 0,
  latestVersionId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
})

const run = (seed: readonly Dataset[], args: { readonly searchQuery?: string; readonly limit?: number }) => {
  const { repository } = createFakeDatasetRepository(seed)
  return Effect.runPromise(
    searchDatasets(args).pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(DatasetRepository, repository), Layer.succeed(SqlClient, inertSqlClient as never)),
      ),
    ),
  )
}

describe("searchDatasets", () => {
  const seed = [
    makeDataset("d1", projectA, "Customer Reviews"),
    makeDataset("d2", projectB, "Customer Orders"),
    makeDataset("d3", projectA, "Unrelated Logs"),
  ]

  it("returns matching datasets across multiple projects in the org", async () => {
    const results = await run(seed, { searchQuery: "customer" })
    expect(results.map((r) => r.name).sort()).toEqual(["Customer Orders", "Customer Reviews"])
    // spans more than one project
    expect(new Set(results.map((r) => r.projectId)).size).toBe(2)
  })

  it("carries owning project display fields", async () => {
    const results = await run(seed, { searchQuery: "reviews" })
    expect(results).toHaveLength(1)
    expect(results[0]?.projectId).toBe(projectA)
    expect(results[0]?.projectSlug).toContain(projectA)
    expect(results[0]?.projectName).toContain(projectA)
  })

  it("respects the limit", async () => {
    const results = await run(seed, { searchQuery: "customer", limit: 1 })
    expect(results).toHaveLength(1)
  })
})
