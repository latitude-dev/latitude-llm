import { describe, expect, it } from "vitest"
import { isInlineRenderableUrl, isPdfMime, shouldAutoRenderThumbnail } from "./pdf-source.ts"

describe("isPdfMime", () => {
  it("accepts a bare and a parameterised pdf mime", () => {
    expect(isPdfMime("application/pdf")).toBe(true)
    expect(isPdfMime("application/pdf; charset=binary")).toBe(true)
    expect(isPdfMime("APPLICATION/PDF")).toBe(true)
  })

  it("rejects everything else", () => {
    expect(isPdfMime("image/png")).toBe(false)
    expect(isPdfMime(null)).toBe(false)
    expect(isPdfMime(undefined)).toBe(false)
  })
})

describe("shouldAutoRenderThumbnail", () => {
  it("renders under the guard and defers above it", () => {
    expect(shouldAutoRenderThumbnail(9_000_000)).toBe(true)
    expect(shouldAutoRenderThumbnail(11_000_000)).toBe(false)
  })

  it("defers when the size is unknown", () => {
    expect(shouldAutoRenderThumbnail(undefined)).toBe(false)
  })
})

describe("isInlineRenderableUrl", () => {
  const origin = "https://app.latitude.so"

  it("accepts same-origin and relative urls", () => {
    expect(isInlineRenderableUrl("/files/a.pdf", origin)).toBe(true)
    expect(isInlineRenderableUrl("https://app.latitude.so/files/a.pdf", origin)).toBe(true)
  })

  it("rejects cross-origin urls that pdf.js could not fetch", () => {
    expect(isInlineRenderableUrl("https://cdn.example.com/a.pdf", origin)).toBe(false)
  })

  it("accepts in-memory sources regardless of origin", () => {
    expect(isInlineRenderableUrl("blob:https://app.latitude.so/uuid", origin)).toBe(true)
    expect(isInlineRenderableUrl("data:application/pdf;base64,JVBERi0=", undefined)).toBe(true)
  })

  it("rejects everything when there is no origin, as during server rendering", () => {
    expect(isInlineRenderableUrl("/files/a.pdf", undefined)).toBe(false)
  })
})
