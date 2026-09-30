import { describe, expect, it } from "vitest"
import { respondFallback, respondRendered } from "./respond.ts"

describe("respondRendered", () => {
  it("caches a rendered image for good, since its URL is its input", () => {
    const response = respondRendered(Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable")
    expect(response.headers.get("Content-Type")).toBe("image/png")
    expect(response.headers.get("Content-Length")).toBe("4")
  })
})

describe("respondFallback", () => {
  it("never lets a cache keep the stand-in for a failed render", () => {
    const cacheControl = respondFallback().headers.get("Cache-Control") ?? ""

    expect(cacheControl).toBe("no-store")
    expect(cacheControl).not.toContain("immutable")
  })

  it("still answers with a PNG, so the embed renders an element", async () => {
    const response = respondFallback()

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/png")
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })
})
