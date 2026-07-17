import { describe, expect, it } from "vitest"
import { computeDiffRows, type DiffRow } from "./diff-model.ts"

describe("computeDiffRows", () => {
  it("numbers context lines by their real position on each side across a hunk", () => {
    const before = "a\nb\nc\nd\n"
    const after = "a\nc\nd\n"
    const rows = computeDiffRows(before, after)

    expect(rows.map((r) => [r.kind, r.oldLineNumber, r.newLineNumber, r.text])).toEqual([
      ["context", 1, 1, "a"],
      ["remove", 2, null, "b"],
      ["context", 3, 2, "c"],
      ["context", 4, 3, "d"],
    ])
  })

  it("counts pure additions on the new side only", () => {
    const rows = computeDiffRows("a\nb\n", "a\nx\ny\nb\n")
    expect(rows).toEqual([
      { kind: "context", oldLineNumber: 1, newLineNumber: 1, text: "a", emphases: [] },
      { kind: "add", oldLineNumber: null, newLineNumber: 2, text: "x", emphases: [] },
      { kind: "add", oldLineNumber: null, newLineNumber: 3, text: "y", emphases: [] },
      { kind: "context", oldLineNumber: 2, newLineNumber: 4, text: "b", emphases: [] },
    ])
  })

  it("emits removed lines before added lines for a modification, with word-level emphasis", () => {
    const [removed, added] = computeDiffRows('"temperature": 0.7\n', '"temperature": 0.5\n')
    expect([removed?.kind, removed?.oldLineNumber, removed?.newLineNumber]).toEqual(["remove", 1, null])
    expect([added?.kind, added?.oldLineNumber, added?.newLineNumber]).toEqual(["add", null, 1])

    const emphasized = (row: DiffRow | undefined) =>
      row ? row.emphases.map(([f, t]) => row.text.slice(f, t)).join("") : ""
    // Only the changed digit is emphasized, not the whole line.
    expect(emphasized(removed)).toBe("7")
    expect(emphasized(added)).toBe("5")
  })

  it("treats identical bodies as all context", () => {
    const rows = computeDiffRows("x\ny\n", "x\ny\n")
    expect(rows.every((r) => r.kind === "context")).toBe(true)
    expect(rows).toHaveLength(2)
  })

  it("marks a whole added body when the before is empty", () => {
    const rows = computeDiffRows("", "hello\nworld\n")
    expect(rows).toEqual([
      { kind: "add", oldLineNumber: null, newLineNumber: 1, text: "hello", emphases: [] },
      { kind: "add", oldLineNumber: null, newLineNumber: 2, text: "world", emphases: [] },
    ])
  })
})
