import { DatasetId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Dataset } from "../entities/dataset.ts"
import { DatasetColumnNotFoundError } from "../errors.ts"
import { DatasetRepository } from "../ports/dataset-repository.ts"
import { createFakeDatasetRepository } from "../testing/fake-dataset-repository.ts"
import { addColumn, listColumns, removeColumn, reorderColumns, restoreColumn, updateColumn } from "./manage-columns.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const datasetId = DatasetId("d".repeat(24))

const inertSqlClient = {
  organizationId,
  transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  query: () => Effect.die("SqlClient.query should not be called"),
}

const seedDataset = (): Dataset => ({
  id: datasetId,
  organizationId,
  projectId,
  slug: "ds",
  name: "My Dataset",
  description: null,
  fileKey: null,
  columns: null,
  currentVersion: 3,
  latestVersionId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
})

const harness = () => {
  const { repository, datasets } = createFakeDatasetRepository([seedDataset()], undefined, { organizationId })
  const run = <A, E>(effect: Effect.Effect<A, E, DatasetRepository | SqlClient>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(DatasetRepository, repository),
            Layer.succeed(SqlClient, inertSqlClient as never),
          ),
        ),
      ),
    )
  return { run, datasets }
}

describe("manage-columns", () => {
  it("listColumns returns the four built-in columns when columns is null", async () => {
    const { run } = harness()
    const columns = await run(listColumns({ datasetId }))
    expect(columns.map((c) => c.identifier)).toEqual(["input", "output", "expectedOutput", "metadata"])
    expect(columns.every((c) => c.source.kind === "builtin" && !c.removed)).toBe(true)
  })

  it("addColumn seeds built-ins then appends a custom column without bumping the version", async () => {
    const { run, datasets } = harness()
    const column = await run(addColumn({ datasetId, name: "Score" }))
    expect(column.source).toEqual({ kind: "custom" })
    expect(column.name).toBe("Score")

    const stored = datasets.get(datasetId)
    expect(stored?.columns?.map((c) => c.identifier)).toEqual([
      "input",
      "output",
      "expectedOutput",
      "metadata",
      column.identifier,
    ])
    // Schema edits never move the version needle.
    expect(stored?.currentVersion).toBe(3)
  })

  it("removeColumn soft-deletes a built-in column, excluding it from the active schema", async () => {
    const { run, datasets } = harness()
    await run(removeColumn({ datasetId, identifier: "metadata" }))
    expect(datasets.get(datasetId)?.columns?.find((c) => c.identifier === "metadata")?.removed).toBe(true)
    const active = await run(listColumns({ datasetId }))
    expect(active.some((c) => c.identifier === "metadata")).toBe(false)
  })

  it("updateColumn renames a custom column", async () => {
    const { run } = harness()
    const created = await run(addColumn({ datasetId, name: "Score" }))
    const renamed = await run(updateColumn({ datasetId, identifier: created.identifier, name: "Rating" }))
    expect(renamed.identifier).toBe(created.identifier)
    expect(renamed.name).toBe("Rating")
  })

  it("removeColumn soft-deletes a custom column, retaining the descriptor", async () => {
    const { run, datasets } = harness()
    const created = await run(addColumn({ datasetId, name: "Score" }))
    await run(removeColumn({ datasetId, identifier: created.identifier }))

    // Descriptor is retained (with removed: true) but excluded from the active schema.
    const stored = datasets.get(datasetId)?.columns?.find((c) => c.identifier === created.identifier)
    expect(stored?.removed).toBe(true)
    const active = await run(listColumns({ datasetId }))
    expect(active.some((c) => c.identifier === created.identifier)).toBe(false)
  })

  it("restoreColumn brings a removed column back into the active schema", async () => {
    const { run } = harness()
    const created = await run(addColumn({ datasetId, name: "Score" }))
    await run(removeColumn({ datasetId, identifier: created.identifier }))
    const restored = await run(restoreColumn({ datasetId, identifier: created.identifier }))
    expect(restored.removed).toBe(false)
    const active = await run(listColumns({ datasetId }))
    expect(active.some((c) => c.identifier === created.identifier)).toBe(true)
  })

  it("reorderColumns persists the new order and appends omitted columns", async () => {
    const { run, datasets } = harness()
    const created = await run(addColumn({ datasetId, name: "Score" }))
    // Move the custom column to the front; omit metadata to verify it's appended.
    await run(reorderColumns({ datasetId, order: [created.identifier, "input", "output", "expectedOutput"] }))
    expect(datasets.get(datasetId)?.columns?.map((c) => c.identifier)).toEqual([
      created.identifier,
      "input",
      "output",
      "expectedOutput",
      "metadata",
    ])
    // Reorder is a metadata edit; the version stays put.
    expect(datasets.get(datasetId)?.currentVersion).toBe(3)
  })

  it("updateColumn on an unknown identifier fails with DatasetColumnNotFoundError", async () => {
    const { run } = harness()
    const error = await run(updateColumn({ datasetId, identifier: "nope", name: "Nope" }).pipe(Effect.flip))
    expect(error).toBeInstanceOf(DatasetColumnNotFoundError)
  })
})
