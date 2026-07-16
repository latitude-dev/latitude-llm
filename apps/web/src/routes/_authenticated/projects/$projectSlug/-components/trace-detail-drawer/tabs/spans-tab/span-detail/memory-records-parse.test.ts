import { describe, expect, it } from "vitest"
import { parseMemoryRecords } from "./memory-records-parse.ts"

describe("parseMemoryRecords", () => {
  it("parses an array of records that carry content", () => {
    const raw = JSON.stringify([
      { id: "mem_1", content: "User prefers dark mode", score: 0.95 },
      { content: { note: "no id, object content" } },
    ])

    const records = parseMemoryRecords(raw)

    expect(records).toHaveLength(2)
    expect(records?.[0]).toMatchObject({ id: "mem_1", content: "User prefers dark mode", score: 0.95 })
    expect(records?.[1]?.content).toEqual({ note: "no id, object content" })
  })

  it("returns null for an empty payload", () => {
    expect(parseMemoryRecords("")).toBeNull()
  })

  it("returns null for invalid JSON", () => {
    expect(parseMemoryRecords("{not json")).toBeNull()
  })

  it("returns null for an empty array", () => {
    expect(parseMemoryRecords("[]")).toBeNull()
  })

  it("returns null when the payload is a bare object rather than an array", () => {
    expect(parseMemoryRecords(JSON.stringify({ content: "single, not wrapped" }))).toBeNull()
  })

  it("returns null when any element is missing content (off-schema)", () => {
    expect(parseMemoryRecords(JSON.stringify([{ id: "mem_1" }]))).toBeNull()
    expect(parseMemoryRecords(JSON.stringify([{ content: "ok" }, "not-an-object"]))).toBeNull()
  })
})
