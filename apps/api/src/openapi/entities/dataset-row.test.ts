import type { DatasetRow } from "@domain/datasets"
import { DatasetId, DatasetRowId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { DatasetRowSchema, toDatasetRowResponse } from "./dataset-row.ts"

// The MCP server validates a tool's `structuredContent` against the
// `outputSchema` it derives from this exact schema (see mcp/server.ts).
// A cell can round-trip out of ClickHouse as any JSON value safeParseJson
// emits, so the schema must accept all of them or the MCP call fails with
// `-32602 Output validation error`.
const baseRow: Omit<DatasetRow, "input" | "output"> = {
  rowId: DatasetRowId("row-1"),
  datasetId: DatasetId("cm000000000000000000ds01"),
  expectedOutput: "",
  metadata: {},
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  version: 1,
}

describe("DatasetRowSchema", () => {
  it.each([
    ["string", "hello"],
    ["number", 42],
    ["boolean", true],
    ["array", [{ role: "user", content: "hi" }]],
    ["object", { question: "weather" }],
  ])("accepts a %s cell value through toDatasetRowResponse", (_label, value) => {
    const response = toDatasetRowResponse({
      ...baseRow,
      input: value as DatasetRow["input"],
      output: value as DatasetRow["output"],
    })

    const result = DatasetRowSchema.safeParse(response)

    expect(result.success).toBe(true)
  })
})
