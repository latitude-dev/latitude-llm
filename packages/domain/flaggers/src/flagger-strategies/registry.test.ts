import { describe, expect, it } from "vitest"
import { assertFlaggerRegistryValid } from "./index.ts"

describe("flagger strategy registry", () => {
  // Runs the suppression-graph validation that used to be a module-load IIFE
  // (moved to a test so the package stays side-effect-free and tree-shakeable).
  it("has a valid suppression graph", () => {
    expect(() => assertFlaggerRegistryValid()).not.toThrow()
  })
})
