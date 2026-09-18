import { describe, expect, it } from "vitest"
import { isChunkLoadError } from "./chunk-load-error.ts"

describe("isChunkLoadError", () => {
  it("matches Safari's dynamic import failure message", () => {
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true)
  })

  it("matches Chrome's dynamic import failure message", () => {
    expect(
      isChunkLoadError(
        new Error("Failed to fetch dynamically imported module: https://console.latitude.so/assets/foo-abc123.js"),
      ),
    ).toBe(true)
  })

  it("matches Firefox's dynamic import failure message", () => {
    expect(isChunkLoadError(new Error("error loading dynamically imported module: https://example.com/foo.js"))).toBe(
      true,
    )
  })

  it("rejects unrelated errors", () => {
    expect(isChunkLoadError(new Error("boom"))).toBe(false)
    expect(isChunkLoadError(new Error("TypeError: cannot read property of undefined"))).toBe(false)
  })

  it("rejects non-Error values", () => {
    expect(isChunkLoadError("Importing a module script failed.")).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})
