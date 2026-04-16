import { describe, expect, it, vi } from "vitest"
import { createDraftRowRecord, isDatasetDraftRowId } from "./dataset-draft-row.ts"

describe("dataset-draft-row", () => {
  it("creates a draft row with the expected shape", () => {
    const row = createDraftRowRecord("dataset-123")

    expect(isDatasetDraftRowId(row.rowId)).toBe(true)
    expect(row.datasetId).toBe("dataset-123")
    expect(row.input).toBe("")
    expect(row.output).toBe("")
    expect(row.metadata).toBe("")
    expect(row.version).toBe(0)
  })

  it("does not rely on crypto.randomUUID", () => {
    const randomUuidSpy = vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("randomUUID unavailable")
    })

    expect(() => createDraftRowRecord("dataset-123")).not.toThrow()

    randomUuidSpy.mockRestore()
  })
})
