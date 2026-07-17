import { describe, expect, it } from "vitest"
import { buildRecordTree } from "./build-record-tree.ts"

describe("buildRecordTree", () => {
  it("keeps records without '/' as flat, alphabetically sorted siblings", () => {
    const tree = buildRecordTree([{ recordId: "b" }, { recordId: "a" }])
    expect(tree.map((node) => node.segment)).toEqual(["a", "b"])
    expect(tree.every((node) => node.recordId !== undefined && node.children.length === 0)).toBe(true)
  })

  it("nests ids split on '/', folders before files", () => {
    const tree = buildRecordTree([{ recordId: "prefs/theme" }, { recordId: "prefs/lang" }, { recordId: "top" }])
    expect(tree.map((node) => node.segment)).toEqual(["prefs", "top"])
    const prefs = tree[0]!
    expect(prefs.recordId).toBeUndefined()
    expect(prefs.children.map((child) => child.segment)).toEqual(["lang", "theme"])
    expect(prefs.children.map((child) => child.recordId)).toEqual(["prefs/lang", "prefs/theme"])
  })

  it("supports a node that is both a record and a parent", () => {
    const tree = buildRecordTree([{ recordId: "a" }, { recordId: "a/b" }])
    expect(tree).toHaveLength(1)
    const a = tree[0]!
    expect(a.recordId).toBe("a")
    expect(a.children.map((child) => child.recordId)).toEqual(["a/b"])
  })

  it("keeps the unnamed record (id '') as a single leaf", () => {
    const tree = buildRecordTree([{ recordId: "" }])
    expect(tree).toHaveLength(1)
    expect(tree[0]!.segment).toBe("")
    expect(tree[0]!.recordId).toBe("")
  })
})
