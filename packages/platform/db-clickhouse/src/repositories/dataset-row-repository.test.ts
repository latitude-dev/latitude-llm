import { DatasetRowRepository, type DatasetRowRepositoryShape } from "@domain/datasets"
import { DatasetId, DatasetRowId, OrganizationId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { queryClickhouse } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { DatasetRowRepositoryLive } from "./dataset-row-repository.ts"

const ORG_ID = OrganizationId("test-org-row-repo")
const DATASET_ID = DatasetId("test-ds-row-repo")

const ch = setupTestClickHouse()

describe("DatasetRowClickHouseRepository", () => {
  let repo: DatasetRowRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* DatasetRowRepository
      }).pipe(withClickHouse(DatasetRowRepositoryLive, ch.client, ORG_ID)),
    )
  })

  describe("updateRow", () => {
    it("inserts new row version at higher xact_id", async () => {
      const rowId = DatasetRowId("upd-row-1")

      await Effect.runPromise(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { prompt: "original" }, output: { text: "v1" } }],
        }),
      )

      await Effect.runPromise(
        repo.updateRow({
          datasetId: DATASET_ID,
          rowId,
          version: 2,
          input: { prompt: "updated" },
          output: { text: "v2" },
          metadata: {},
        }),
      )

      const row = await Effect.runPromise(repo.findById({ datasetId: DATASET_ID, rowId }))

      expect(row.input).toEqual({ prompt: "updated" })
      expect(row.output).toEqual({ text: "v2" })
      expect(row.version).toBe(2)
    })

    it("queries return latest version via argMax", async () => {
      const rowId = DatasetRowId("upd-row-2")

      await Effect.runPromise(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { v: 1 } }],
        }),
      )

      for (const ver of [2, 3]) {
        await Effect.runPromise(
          repo.updateRow({
            datasetId: DATASET_ID,
            rowId,
            version: ver,
            input: { v: ver },
            output: {},
            metadata: {},
          }),
        )
      }

      const { rows } = await Effect.runPromise(repo.list({ datasetId: DATASET_ID }))

      const found = rows.find((r) => r.rowId === rowId)
      expect(found).toBeDefined()
      expect(found?.input).toEqual({ v: 3 })
      expect(found?.version).toBe(3)
    })
  })

  describe("deleteBatch", () => {
    it("inserts tombstone rows with _object_delete=true", async () => {
      const rowId = DatasetRowId("del-row-1")

      await Effect.runPromise(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { data: "exists" } }],
        }),
      )

      await Effect.runPromise(
        repo.deleteBatch({
          datasetId: DATASET_ID,
          rowIds: [rowId],
          version: 2,
        }),
      )

      const rawRows = await Effect.runPromise(
        queryClickhouse<{ _object_delete: string; xact_id: string }>(
          ch.client,
          `SELECT _object_delete, xact_id FROM dataset_rows
           WHERE organization_id = {org:String} AND dataset_id = {ds:String} AND row_id = {rowId:String}
           ORDER BY xact_id ASC`,
          { org: ORG_ID, ds: DATASET_ID, rowId },
        ),
      )

      expect(rawRows.length).toBe(2)
      expect(String(rawRows[1]?._object_delete)).toBe("true")
    })

    it("deleted rows are filtered out in list queries", async () => {
      const keepId = DatasetRowId("del-row-keep")
      const deleteId = DatasetRowId("del-row-remove")

      await Effect.runPromise(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [
            { id: keepId, input: { keep: true } },
            { id: deleteId, input: { keep: false } },
          ],
        }),
      )

      await Effect.runPromise(
        repo.deleteBatch({
          datasetId: DATASET_ID,
          rowIds: [deleteId],
          version: 2,
        }),
      )

      const { rows, total } = await Effect.runPromise(repo.list({ datasetId: DATASET_ID }))

      expect(total).toBe(1)
      expect(rows.length).toBe(1)
      expect(rows[0]?.rowId).toBe(keepId)
    })

    it("handles empty rowIds array gracefully", async () => {
      await Effect.runPromise(
        repo.deleteBatch({
          datasetId: DATASET_ID,
          rowIds: [],
          version: 1,
        }),
      )
    })
  })

  describe("field serialization", () => {
    it("round-trips plain string values without turning them into {}", async () => {
      const rowId = DatasetRowId("plain-str-1")

      await Effect.runPromise(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { key: "json" }, output: { result: "ok" } }],
        }),
      )

      await Effect.runPromise(
        repo.updateRow({
          datasetId: DATASET_ID,
          rowId,
          version: 2,
          input: "HOLA",
          output: "plain text output",
          metadata: "",
        }),
      )

      const row = await Effect.runPromise(repo.findById({ datasetId: DATASET_ID, rowId }))

      expect(row.input).toBe("HOLA")
      expect(row.output).toBe("plain text output")
      expect(row.metadata).toBe("")
    })

    it("stores empty objects as empty strings", async () => {
      const rowId = DatasetRowId("empty-obj-1")

      await Effect.runPromise(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { key: "value" }, output: {}, metadata: {} }],
        }),
      )

      const row = await Effect.runPromise(repo.findById({ datasetId: DATASET_ID, rowId }))

      expect(row.input).toEqual({ key: "value" })
      expect(row.output).toBe("")
      expect(row.metadata).toBe("")
    })

    it("preserves JSON objects through round-trip", async () => {
      const rowId = DatasetRowId("json-rt-1")

      await Effect.runPromise(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { code: "yellow72", nested: { a: 1 } }, output: { answer: 42 } }],
        }),
      )

      const row = await Effect.runPromise(repo.findById({ datasetId: DATASET_ID, rowId }))

      expect(row.input).toEqual({ code: "yellow72", nested: { a: 1 } })
      expect(row.output).toEqual({ answer: 42 })
    })
  })

  describe("findById", () => {
    it("returns RowNotFoundError for non-existent row", async () => {
      const result = await Effect.runPromiseExit(
        repo.findById({ datasetId: DATASET_ID, rowId: DatasetRowId("nonexistent") }),
      )

      expect(result._tag).toBe("Failure")
    })
  })
})
