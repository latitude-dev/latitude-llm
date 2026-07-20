import { describe, expect, it } from "vitest"
import { computeDiffRows, type DiffFoldItem, type DiffItem, type DiffRow, foldDiffRows } from "./diff-model.ts"

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

  it("falls back to line-level (no word emphasis) for very large replacements", () => {
    const before = `${"a".repeat(15_000)}\n`
    const after = `${"b".repeat(15_000)}\n`
    const rows = computeDiffRows(before, after)

    expect(rows.map((r) => r.kind)).toEqual(["remove", "add"])
    expect(rows.every((r) => r.emphases.length === 0)).toBe(true)
    expect([rows[0]?.oldLineNumber, rows[0]?.newLineNumber]).toEqual([1, null])
    expect([rows[1]?.oldLineNumber, rows[1]?.newLineNumber]).toEqual([null, 1])
  })
})

const joined = (lines: string[]) => `${lines.join("\n")}\n`
const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const folds = (items: DiffItem[]) => items.filter((item): item is DiffFoldItem => item.type === "fold")
const contextTexts = (items: DiffItem[]) =>
  items.flatMap((item) => (item.type === "line" && item.row.kind === "context" ? [item.row.text] : []))

describe("foldDiffRows", () => {
  it("folds a large interior gap, keeping context lines on both sides", () => {
    const mid = range("m", 20)
    const rows = computeDiffRows(joined(["A", ...mid, "B"]), joined(["A2", ...mid, "B2"]))
    const items = foldDiffRows(rows, 3)

    expect(folds(items)).toHaveLength(1)
    expect(folds(items)[0]?.rows).toHaveLength(14) // 20 - 3 head - 3 tail
    expect(contextTexts(items)).toEqual(["m1", "m2", "m3", "m18", "m19", "m20"])
  })

  it("does not fold a gap no larger than the context it would keep", () => {
    const rows = computeDiffRows(joined(["A", ...range("m", 4), "B"]), joined(["A2", ...range("m", 4), "B2"]))
    const items = foldDiffRows(rows, 3)

    expect(folds(items)).toHaveLength(0)
    expect(contextTexts(items)).toEqual(["m1", "m2", "m3", "m4"])
  })

  it("folds a leading gap, keeping only the context before the first change", () => {
    const rows = computeDiffRows(joined([...range("h", 20), "X"]), joined([...range("h", 20), "Y"]))
    const items = foldDiffRows(rows, 3)

    expect(folds(items)).toHaveLength(1)
    expect(folds(items)[0]?.rows).toHaveLength(17)
    expect(contextTexts(items)).toEqual(["h18", "h19", "h20"])
  })

  it("folds a trailing gap, keeping only the context after the last change", () => {
    const rows = computeDiffRows(joined(["X", ...range("t", 20)]), joined(["Y", ...range("t", 20)]))
    const items = foldDiffRows(rows, 3)

    expect(folds(items)).toHaveLength(1)
    expect(folds(items)[0]?.rows).toHaveLength(17)
    expect(contextTexts(items)).toEqual(["t1", "t2", "t3"])
  })

  it("never folds when there are no changes", () => {
    const items = foldDiffRows(computeDiffRows(joined(range("x", 30)), joined(range("x", 30))), 3)
    expect(folds(items)).toHaveLength(0)
    expect(items).toHaveLength(30)
  })

  it("never folds a pure addition (no context rows)", () => {
    const items = foldDiffRows(computeDiffRows("", joined(range("n", 10))), 3)
    expect(folds(items)).toHaveLength(0)
    expect(items).toHaveLength(10)
  })
})
