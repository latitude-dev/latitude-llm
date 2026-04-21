import { describe, expect, it } from "vitest"
import type { DatasetRow } from "./entities/dataset-row.ts"
import { buildDatasetCsvExport, csvExportHeader, rowsToCsvFragment } from "./export-csv.ts"

function row(overrides: Partial<DatasetRow> & Pick<DatasetRow, "input" | "output" | "metadata">): DatasetRow {
  return {
    rowId: "row-1" as DatasetRow["rowId"],
    datasetId: "ds-1" as DatasetRow["datasetId"],
    createdAt: new Date(),
    version: 1,
    ...overrides,
  }
}

describe("export-csv", () => {
  describe("csvExportHeader", () => {
    it("returns header line with input, output, metadata columns", () => {
      const header = csvExportHeader()
      expect(header).toContain("input")
      expect(header).toContain("output")
      expect(header).toContain("metadata")
      expect(header.trim().split(",").length).toBe(3)
    })
  })

  describe("rowsToCsvFragment", () => {
    it("returns empty string for no rows", () => {
      expect(rowsToCsvFragment([])).toBe("")
    })

    it("serializes rows to CSV lines without a header row", () => {
      const rows: DatasetRow[] = [
        row({ input: "prompt", output: "answer", metadata: "{}" }),
        row({ input: "a,b", output: "x\ny", metadata: "" }),
      ]
      const fragment = rowsToCsvFragment(rows)
      expect(fragment).not.toContain(csvExportHeader())
      expect(fragment).toContain("prompt")
      expect(fragment).toContain("answer")
      expect(fragment).toContain("a,b")
      expect(fragment).toContain("x\ny")
    })

    it("stringifies object fields as JSON", () => {
      const rows: DatasetRow[] = [row({ input: { k: "v" }, output: {}, metadata: "m" })]
      const fragment = rowsToCsvFragment(rows)
      expect(fragment).toContain("k")
      expect(fragment).toContain("v")
      expect(fragment).toContain("m")
    })
  })

  describe("buildDatasetCsvExport", () => {
    it("returns csv string and safe filename from dataset name", () => {
      const { csv, filename } = buildDatasetCsvExport("My Dataset 1", [row({ input: "q", output: "a", metadata: "" })])
      expect(csv).toContain("input")
      expect(csv).toContain("output")
      expect(csv).toContain("metadata")
      expect(csv).toContain("q")
      expect(filename).toBe("My_Dataset_1.csv")
    })

    it("sanitizes dataset name for filename", () => {
      const { filename } = buildDatasetCsvExport("Unsafe<>Name!", [])
      expect(filename).toMatch(/^[\w_.-]+\.csv$/)
    })
  })
})
