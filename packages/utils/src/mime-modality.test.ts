import { describe, expect, it } from "vitest"
import { inferModalityFromMime, resolveContentModality } from "./mime-modality.ts"

describe("inferModalityFromMime", () => {
  it("maps image/audio/video tops to their modalities", () => {
    expect(inferModalityFromMime("image/png")).toBe("image")
    expect(inferModalityFromMime("image/svg+xml")).toBe("image")
    expect(inferModalityFromMime("audio/mpeg")).toBe("audio")
    expect(inferModalityFromMime("video/mp4")).toBe("video")
  })

  it("maps documents and unknown types to document", () => {
    expect(inferModalityFromMime("application/pdf")).toBe("document")
    expect(inferModalityFromMime("text/csv")).toBe("document")
    expect(inferModalityFromMime("application/octet-stream")).toBe("document")
  })

  it("ignores mime parameters", () => {
    expect(inferModalityFromMime("application/pdf; charset=binary")).toBe("document")
    expect(inferModalityFromMime("IMAGE/JPEG")).toBe("image")
  })
})

describe("resolveContentModality", () => {
  it("prefers mime over a wrong producer modality", () => {
    expect(resolveContentModality("image", "application/pdf")).toBe("document")
  })

  it("keeps producer modality when mime is absent", () => {
    expect(resolveContentModality("image", undefined)).toBe("image")
    expect(resolveContentModality("image", null)).toBe("image")
  })
})
