import { DatasetRowRepository, type DatasetRowRepositoryShape } from "@domain/datasets"
import { type ChSqlClient, DatasetId, DatasetRowId, OrganizationId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { queryClickhouse } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { DatasetRowRepositoryLive } from "./dataset-row-repository.ts"

const ORG_ID = OrganizationId("test-org-row-repo")
const DATASET_ID = DatasetId("test-ds-row-repo")

const ch = setupTestClickHouse()

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

const runChExit = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

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

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { prompt: "original" }, output: { text: "v1" } }],
        }),
      )

      await runCh(
        repo.updateRow({
          datasetId: DATASET_ID,
          rowId,
          version: 2,
          input: { prompt: "updated" },
          output: { text: "v2" },
          metadata: {},
        }),
      )

      const row = await runCh(repo.findById({ datasetId: DATASET_ID, rowId }))

      expect(row.input).toEqual({ prompt: "updated" })
      expect(row.output).toEqual({ text: "v2" })
      expect(row.version).toBe(2)
    })

    it("queries return latest version via argMax", async () => {
      const rowId = DatasetRowId("upd-row-2")

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { v: 1 } }],
        }),
      )

      for (const ver of [2, 3]) {
        await runCh(
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

      const { rows } = await runCh(repo.list({ datasetId: DATASET_ID }))

      const found = rows.find((r) => r.rowId === rowId)
      expect(found).toBeDefined()
      expect(found?.input).toEqual({ v: 3 })
      expect(found?.version).toBe(3)
    })
  })

  describe("deleteBatch", () => {
    it("inserts tombstone rows with _object_delete=true", async () => {
      const rowId = DatasetRowId("del-row-1")

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { data: "exists" } }],
        }),
      )

      await runCh(
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

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [
            { id: keepId, input: { keep: true } },
            { id: deleteId, input: { keep: false } },
          ],
        }),
      )

      await runCh(
        repo.deleteBatch({
          datasetId: DATASET_ID,
          rowIds: [deleteId],
          version: 2,
        }),
      )

      const { rows, total } = await runCh(repo.list({ datasetId: DATASET_ID }))

      expect(total).toBe(1)
      expect(rows.length).toBe(1)
      expect(rows[0]?.rowId).toBe(keepId)
    })

    it("handles empty rowIds array gracefully", async () => {
      await runCh(
        repo.deleteBatch({
          datasetId: DATASET_ID,
          rowIds: [],
          version: 1,
        }),
      )
    })
  })

  describe("deleteAll", () => {
    it("tombstones all active rows and returns the count", async () => {
      const ids = [DatasetRowId("delall-1"), DatasetRowId("delall-2"), DatasetRowId("delall-3")]

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: ids.map((id) => ({ id, input: { data: "alive" } })),
        }),
      )

      const deleted = await runCh(repo.deleteAll({ datasetId: DATASET_ID, version: 2 }))

      expect(deleted).toBeGreaterThanOrEqual(3)

      const { rows } = await runCh(repo.list({ datasetId: DATASET_ID }))
      const remaining = rows.filter((r) => ids.includes(r.rowId as DatasetRowId))
      expect(remaining.length).toBe(0)
    })

    it("returns 0 when no active rows exist", async () => {
      const deleted = await runCh(repo.deleteAll({ datasetId: DatasetId("empty-ds"), version: 1 }))
      expect(deleted).toBe(0)
    })

    it("preserves excluded rows", async () => {
      const keep = DatasetRowId("delall-keep")
      const remove1 = DatasetRowId("delall-rm-1")
      const remove2 = DatasetRowId("delall-rm-2")

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [
            { id: keep, input: { data: "keep" } },
            { id: remove1, input: { data: "remove" } },
            { id: remove2, input: { data: "remove" } },
          ],
        }),
      )

      const deleted = await runCh(
        repo.deleteAll({ datasetId: DATASET_ID, version: 2, excludedRowIds: [keep] }),
      )

      expect(deleted).toBe(2)

      const row = await runCh(repo.findById({ datasetId: DATASET_ID, rowId: keep }))
      expect(row.input).toEqual({ data: "keep" })
    })
  })

  describe("field serialization", () => {
    it("round-trips plain string values without turning them into {}", async () => {
      const rowId = DatasetRowId("plain-str-1")

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { key: "json" }, output: { result: "ok" } }],
        }),
      )

      await runCh(
        repo.updateRow({
          datasetId: DATASET_ID,
          rowId,
          version: 2,
          input: "HOLA",
          output: "plain text output",
          metadata: "",
        }),
      )

      const row = await runCh(repo.findById({ datasetId: DATASET_ID, rowId }))

      expect(row.input).toBe("HOLA")
      expect(row.output).toBe("plain text output")
      expect(row.metadata).toBe("")
    })

    it("stores empty objects as empty strings", async () => {
      const rowId = DatasetRowId("empty-obj-1")

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { key: "value" }, output: {}, metadata: {} }],
        }),
      )

      const row = await runCh(repo.findById({ datasetId: DATASET_ID, rowId }))

      expect(row.input).toEqual({ key: "value" })
      expect(row.output).toBe("")
      expect(row.metadata).toBe("")
    })

    it("preserves JSON objects through round-trip", async () => {
      const rowId = DatasetRowId("json-rt-1")

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { code: "yellow72", nested: { a: 1 } }, output: { answer: 42 } }],
        }),
      )

      const row = await runCh(repo.findById({ datasetId: DATASET_ID, rowId }))

      expect(row.input).toEqual({ code: "yellow72", nested: { a: 1 } })
      expect(row.output).toEqual({ answer: 42 })
    })
  })

  describe("findById", () => {
    it("returns RowNotFoundError for non-existent row", async () => {
      const result = await runChExit(
        repo.findById({ datasetId: DATASET_ID, rowId: DatasetRowId("nonexistent") }),
      )

      expect(result._tag).toBe("Failure")
    })
  })

  describe("cursor-based pagination", () => {
    it("returns rows with nextCursor when there are more results", async () => {
      const rowIds = [DatasetRowId("cursor-1"), DatasetRowId("cursor-2"), DatasetRowId("cursor-3")]

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: rowIds.map((id) => ({ id, input: { test: "cursor" } })),
        }),
      )

      const { rows, nextCursor } = await runCh(
        repo.list({ datasetId: DATASET_ID, limit: 2, sortDirection: "desc" }),
      )

      expect(rows.length).toBe(2)
      expect(nextCursor).toBeDefined()
      expect(nextCursor?.createdAt).toBeDefined()
      expect(nextCursor?.rowId).toBeDefined()
    })

    it("does not return nextCursor when no more results exist", async () => {
      const rowIds = [DatasetRowId("cursor-end-1"), DatasetRowId("cursor-end-2")]

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: rowIds.map((id) => ({ id, input: { test: "cursor-end" } })),
        }),
      )

      const { rows, nextCursor } = await runCh(
        repo.list({ datasetId: DATASET_ID, limit: 5, sortDirection: "desc" }),
      )

      expect(rows.length).toBeGreaterThanOrEqual(2)
      expect(nextCursor).toBeUndefined()
    })

    it("uses cursor to fetch next page without duplicates", async () => {
      const rowIds = Array.from({ length: 5 }, (_, i) => DatasetRowId(`cursor-page-${i}`))

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: rowIds.map((id) => ({ id, input: { test: "pagination" } })),
        }),
      )

      const firstPage = await runCh(repo.list({ datasetId: DATASET_ID, limit: 2, sortDirection: "desc" }))

      expect(firstPage.rows.length).toBe(2)
      expect(firstPage.nextCursor).toBeDefined()

      if (!firstPage.nextCursor) throw new Error("Expected nextCursor to be defined")

      const secondPage = await runCh(
        repo.list({ datasetId: DATASET_ID, limit: 2, sortDirection: "desc", cursor: firstPage.nextCursor }),
      )

      expect(secondPage.rows.length).toBe(2)

      const allIds = [...firstPage.rows, ...secondPage.rows].map((r) => r.rowId)
      const uniqueIds = new Set(allIds)
      expect(allIds.length).toBe(uniqueIds.size)
    })

    it("correctly handles row_id tie-breaker when created_at is identical", async () => {
      const rowId1 = DatasetRowId("tie-a")
      const rowId2 = DatasetRowId("tie-b")

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [
            { id: rowId1, input: { test: "tie1" } },
            { id: rowId2, input: { test: "tie2" } },
          ],
        }),
      )

      const { rows } = await runCh(repo.list({ datasetId: DATASET_ID, limit: 10, sortDirection: "desc" }))

      const foundRows = rows.filter((r) => r.rowId === rowId1 || r.rowId === rowId2)
      expect(foundRows.length).toBe(2)
    })

    it("respects sortDirection in cursor pagination", async () => {
      const rowIds = [DatasetRowId("sort-1"), DatasetRowId("sort-2"), DatasetRowId("sort-3")]

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: rowIds.map((id) => ({ id, input: { test: "sort" } })),
        }),
      )

      const descResult = await runCh(repo.list({ datasetId: DATASET_ID, limit: 2, sortDirection: "desc" }))

      const ascResult = await runCh(repo.list({ datasetId: DATASET_ID, limit: 2, sortDirection: "asc" }))

      expect(descResult.rows[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(
        descResult.rows[1]?.createdAt.getTime() ?? 0,
      )
      expect(ascResult.rows[0]?.createdAt.getTime()).toBeLessThanOrEqual(
        ascResult.rows[1]?.createdAt.getTime() ?? Number.POSITIVE_INFINITY,
      )
    })

    it("applies search filter with cursor pagination", async () => {
      const rowIds = [
        DatasetRowId("search-cursor-match-1"),
        DatasetRowId("search-cursor-match-2"),
        DatasetRowId("search-cursor-nomatch"),
      ]

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [
            { id: rowIds[0], input: { text: "cursor findme" } },
            { id: rowIds[1], input: { text: "cursor findme too" } },
            { id: rowIds[2], input: { text: "cursor other" } },
          ],
        }),
      )

      const { rows } = await runCh(
        repo.list({ datasetId: DATASET_ID, limit: 10, search: "findme", sortDirection: "desc" }),
      )

      const matchedIds = rows.filter((r) =>
        [rowIds[0], rowIds[1], rowIds[2]].includes(r.rowId as DatasetRowId & string),
      )
      expect(matchedIds.length).toBe(2)
      expect(matchedIds.every((r) => r.rowId !== rowIds[2])).toBe(true)
    })

    it("applies version filter with cursor pagination", async () => {
      const rowId = DatasetRowId("version-cursor-1")

      await runCh(
        repo.insertBatch({
          datasetId: DATASET_ID,
          version: 1,
          rows: [{ id: rowId, input: { v: 1 } }],
        }),
      )

      await runCh(
        repo.updateRow({
          datasetId: DATASET_ID,
          rowId,
          version: 3,
          input: { v: 3 },
          output: {},
          metadata: {},
        }),
      )

      const v1Result = await runCh(
        repo.list({ datasetId: DATASET_ID, version: 1, limit: 10, sortDirection: "desc" }),
      )

      const v3Result = await runCh(
        repo.list({ datasetId: DATASET_ID, version: 3, limit: 10, sortDirection: "desc" }),
      )

      const v1Row = v1Result.rows.find((r) => r.rowId === rowId)
      const v3Row = v3Result.rows.find((r) => r.rowId === rowId)

      expect(v1Row?.input).toEqual({ v: 1 })
      expect(v3Row?.input).toEqual({ v: 3 })
    })
  })
})
