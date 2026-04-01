import { describe, expect, it } from "vitest"
import { initLatitude } from "./init.ts"

describe("initLatitude", () => {
  it("should throw if apiKey is missing", () => {
    expect(() => initLatitude({ apiKey: "", projectSlug: "test" })).toThrow("apiKey is required")
  })

  it("should throw if projectSlug is missing", () => {
    expect(() => initLatitude({ apiKey: "test", projectSlug: "" })).toThrow("projectSlug is required")
  })

  it("should return provider, flush, and shutdown functions", async () => {
    const result = await initLatitude({
      apiKey: "test-key",
      projectSlug: "test-project",
    })
    expect(result.provider).toBeDefined()
    expect(result.flush).toBeTypeOf("function")
    expect(result.shutdown).toBeTypeOf("function")
  })
})
