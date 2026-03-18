import { describe, expect, it } from "vitest"
import { isValidDatasetExportPayload, parseDatasetExportPayload } from "./dataset-export-payload.ts"

const validPayload = {
  datasetId: "ds-1",
  organizationId: "org-1",
  projectId: "proj-1",
  recipientEmail: "u@example.com",
}

function toBytes(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj))
}

describe("dataset-export-payload", () => {
  describe("isValidDatasetExportPayload", () => {
    it("accepts valid payload with all string fields", () => {
      expect(isValidDatasetExportPayload(validPayload)).toBe(true)
    })

    it("rejects null", () => {
      expect(isValidDatasetExportPayload(null)).toBe(false)
    })

    it("rejects non-object", () => {
      expect(isValidDatasetExportPayload("string")).toBe(false)
      expect(isValidDatasetExportPayload(123)).toBe(false)
    })

    it("rejects missing datasetId", () => {
      const { datasetId: _, ...rest } = validPayload
      expect(isValidDatasetExportPayload(rest)).toBe(false)
    })

    it("rejects wrong type for datasetId", () => {
      expect(isValidDatasetExportPayload({ ...validPayload, datasetId: 1 })).toBe(false)
    })

    it("rejects missing recipientEmail", () => {
      const { recipientEmail: _, ...rest } = validPayload
      expect(isValidDatasetExportPayload(rest)).toBe(false)
    })
  })

  describe("parseDatasetExportPayload", () => {
    it("parses valid JSON bytes to payload", () => {
      const result = parseDatasetExportPayload(toBytes(validPayload))
      expect(result).toEqual(validPayload)
    })

    it("returns null for invalid JSON", () => {
      expect(parseDatasetExportPayload(new TextEncoder().encode("not json"))).toBe(null)
    })

    it("returns null for valid JSON but invalid payload shape", () => {
      expect(parseDatasetExportPayload(toBytes({ datasetId: "x" }))).toBe(null)
      expect(parseDatasetExportPayload(toBytes({ ...validPayload, organizationId: 1 }))).toBe(null)
    })
  })
})
