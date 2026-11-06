import type { DatasetColumn } from "@domain/datasets"
import { describe, expect, it } from "vitest"
import type { DatasetRowRecord } from "../../../../../../domains/datasets/datasets.functions.ts"
import { buildRowDetailSaveData } from "./row-detail-panel.tsx"

const customColumn = (identifier: string): DatasetColumn => ({
  identifier,
  name: identifier,
  source: { kind: "custom" },
})

const makeRow = (cells: {
  input: unknown
  output: unknown
  expectedOutput: unknown
  metadata: unknown
  custom: Record<string, unknown>
}) => cells as unknown as Pick<DatasetRowRecord, "input" | "output" | "expectedOutput" | "metadata" | "custom">

const editedTexts = (overrides: Partial<Record<"input" | "output" | "expectedOutput" | "metadata", string>> = {}) => ({
  input: '{\n  "prompt": "hi"\n}',
  output: "42",
  expectedOutput: "plain",
  metadata: "",
  ...overrides,
})

describe("buildRowDetailSaveData", () => {
  it("keeps the original typed value for untouched fields", () => {
    const row = makeRow({
      input: { prompt: "hi" },
      output: 42,
      expectedOutput: "plain",
      metadata: {},
      custom: {},
    })

    const data = buildRowDetailSaveData({
      row,
      texts: editedTexts({ metadata: "" }),
      customText: {},
      customColumns: [],
    })

    expect(data.input).toEqual({ prompt: "hi" })
    expect(data.output).toBe(42)
    expect(data.expectedOutput).toBe("plain")
    expect(data.metadata).toEqual({})
  })

  it("sends text only for the field the user edited", () => {
    const row = makeRow({
      input: { prompt: "hi" },
      output: 42,
      expectedOutput: "plain",
      metadata: {},
      custom: {},
    })

    const data = buildRowDetailSaveData({
      row,
      texts: editedTexts({ expectedOutput: "revised" }),
      customText: {},
      customColumns: [],
    })

    expect(data.expectedOutput).toBe("revised")
    expect(data.input).toEqual({ prompt: "hi" })
    expect(data.output).toBe(42)
  })

  it("preserves untouched custom column values and sends text for edited ones", () => {
    const row = makeRow({
      input: "",
      output: "",
      expectedOutput: "",
      metadata: "",
      custom: { keep: { nested: [1, 2] }, edit: "old" },
    })

    const data = buildRowDetailSaveData({
      row,
      texts: editedTexts({ input: "", output: "", expectedOutput: "", metadata: "" }),
      customText: { keep: '{\n  "nested": [\n    1,\n    2\n  ]\n}', edit: "new text" },
      customColumns: [customColumn("keep"), customColumn("edit")],
    })

    expect(data.custom.keep).toEqual({ nested: [1, 2] })
    expect(data.custom.edit).toBe("new text")
  })

  it("treats a JSON-looking string the user retyped as text, not a value to reparse", () => {
    const row = makeRow({
      input: "123",
      output: "",
      expectedOutput: "",
      metadata: "",
      custom: {},
    })

    const data = buildRowDetailSaveData({
      row,
      texts: editedTexts({ input: "123", output: "", expectedOutput: "", metadata: "" }),
      customText: {},
      customColumns: [],
    })

    expect(data.input).toBe("123")
  })
})
