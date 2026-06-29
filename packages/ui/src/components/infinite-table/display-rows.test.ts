import { describe, expect, it } from "vitest"
import { buildDisplayRows, type DisplayRow } from "./display-rows.ts"

interface Row {
  readonly id: string
  readonly group: string
}

const row = (id: string, group: string): Row => ({ id, group })
const byGroup = (r: Row) => r.group

const groupKeys = (rows: readonly DisplayRow[]): string[] =>
  rows.flatMap((r) => (r.kind === "group" ? [r.groupKey] : []))

const dataIndices = (rows: readonly DisplayRow[]): number[] =>
  rows.flatMap((r) => (r.kind === "data" ? [r.dataIndex] : []))

describe("buildDisplayRows", () => {
  it("emits one header per group with its rows for contiguous data", () => {
    const data = [row("a", "high"), row("b", "high"), row("c", "none")]
    const rows = buildDisplayRows(data, byGroup, true)

    expect(rows).toEqual([
      { kind: "group", groupKey: "high" },
      { kind: "data", dataIndex: 0 },
      { kind: "data", dataIndex: 1 },
      { kind: "group", groupKey: "none" },
      { kind: "data", dataIndex: 2 },
    ])
  })

  it("buckets fragmented data into exactly one section per group in first-appearance order", () => {
    // Mirrors the reported bug: none, medium, none, high, none interleaved.
    const data = [row("n1", "none"), row("m1", "medium"), row("n2", "none"), row("h1", "high"), row("n3", "none")]
    const rows = buildDisplayRows(data, byGroup, true)

    expect(groupKeys(rows)).toEqual(["none", "medium", "high"])
    // Each row appears exactly once, bucketed under its group, original
    // within-group order preserved.
    expect(dataIndices(rows)).toEqual([0, 2, 4, 1, 3])
  })

  it("returns plain data rows with no headers when grouping is disabled", () => {
    const data = [row("a", "high"), row("b", "none")]

    expect(buildDisplayRows(data, byGroup, false)).toEqual([
      { kind: "data", dataIndex: 0 },
      { kind: "data", dataIndex: 1 },
    ])
    expect(buildDisplayRows(data, undefined, true)).toEqual([
      { kind: "data", dataIndex: 0 },
      { kind: "data", dataIndex: 1 },
    ])
  })

  it("returns an empty list for empty data", () => {
    expect(buildDisplayRows([], byGroup, true)).toEqual([])
  })
})
