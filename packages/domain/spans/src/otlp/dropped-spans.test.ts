import { describe, expect, it } from "vitest"
import { isDroppedSpan } from "./dropped-spans.ts"

describe("isDroppedSpan", () => {
  it("drops OpenClaw's orphan usage span", () => {
    expect(isDroppedSpan("openclaw", "openclaw.model.usage")).toBe(true)
  })

  it("keeps other OpenClaw spans", () => {
    expect(isDroppedSpan("openclaw", "openclaw.model.call")).toBe(false)
    expect(isDroppedSpan("openclaw", "openclaw.run")).toBe(false)
    expect(isDroppedSpan("openclaw", "openclaw.tool.execution")).toBe(false)
  })

  it("is scoped — a same-named span from another scope is not dropped", () => {
    expect(isDroppedSpan("other-scope", "openclaw.model.usage")).toBe(false)
  })
})
