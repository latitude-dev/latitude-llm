import { describe, expect, it } from "vitest"
import { readOnlyToolset } from "./read-only.ts"

describe("readOnlyToolset", () => {
  it("contains only read-only tools and is non-empty", () => {
    expect(readOnlyToolset.tools.length).toBeGreaterThan(0)
    for (const tool of readOnlyToolset.tools) {
      expect(tool.annotations.readOnlyHint).toBe(true)
      expect(tool.annotations.destructiveHint).toBe(false)
    }
  })

  it("includes read-only execute-form operations and excludes writes", () => {
    const names = readOnlyToolset.tools.map((t) => t.name)
    expect(names).toContain("listTools")
    expect(names).not.toContain("createSignal")
  })
})
