import { describe, expect, it } from "vitest"
import { isAdaptiveModeActive } from "./adaptive-mode.ts"

describe("isAdaptiveModeActive", () => {
  it("is false only for off", () => {
    expect(isAdaptiveModeActive("off")).toBe(false)
    expect(isAdaptiveModeActive("enforced")).toBe(true)
  })
})
