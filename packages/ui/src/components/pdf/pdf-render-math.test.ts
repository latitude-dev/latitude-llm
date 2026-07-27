import { describe, expect, it } from "vitest"
import {
  clampPage,
  computePixelRatio,
  fitWidthScale,
  MAX_CANVAS_PIXELS,
  nextZoom,
  quantizeWidth,
} from "./pdf-render-math.ts"

describe("computePixelRatio", () => {
  it("caps the device pixel ratio at 2", () => {
    expect(computePixelRatio({ cssWidth: 200, cssHeight: 300, devicePixelRatio: 3 })).toBe(2)
  })

  it("never drops below 1 for low-DPR displays", () => {
    expect(computePixelRatio({ cssWidth: 200, cssHeight: 300, devicePixelRatio: 0.5 })).toBe(1)
  })

  it("leaves the cap alone when the canvas fits under the pixel ceiling", () => {
    expect(computePixelRatio({ cssWidth: 1200, cssHeight: 1600, devicePixelRatio: 2 })).toBe(2)
  })

  it("clamps below the cap when the canvas would exceed the pixel ceiling", () => {
    const cssWidth = 2000
    const cssHeight = 2400
    const ratio = computePixelRatio({ cssWidth, cssHeight, devicePixelRatio: 2 })

    expect(ratio).toBeLessThan(2)
    expect(cssWidth * ratio * (cssHeight * ratio)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1)
  })

  it("falls back to the capped ratio for a zero-area container", () => {
    expect(computePixelRatio({ cssWidth: 0, cssHeight: 0, devicePixelRatio: 3 })).toBe(2)
  })
})

describe("fitWidthScale", () => {
  it("scales a page to the container width", () => {
    expect(fitWidthScale({ containerWidth: 1200, pageWidth: 600 })).toBe(2)
  })

  it("returns 1 for a not-yet-measured container", () => {
    expect(fitWidthScale({ containerWidth: 0, pageWidth: 600 })).toBe(1)
  })
})

describe("nextZoom", () => {
  it("snaps up to the next step from an arbitrary fit scale", () => {
    expect(nextZoom(1.13, "in")).toBe(1.25)
  })

  it("snaps down to the previous step", () => {
    expect(nextZoom(1.13, "out")).toBe(1)
  })

  it("saturates at the bounds", () => {
    expect(nextZoom(3, "in")).toBe(3)
    expect(nextZoom(0.5, "out")).toBe(0.5)
  })
})

describe("clampPage", () => {
  it("clamps to the document bounds", () => {
    expect(clampPage(0, 12)).toBe(1)
    expect(clampPage(99, 12)).toBe(12)
    expect(clampPage(5, 12)).toBe(5)
  })

  it("handles an unloaded document", () => {
    expect(clampPage(3, 0)).toBe(1)
    expect(clampPage(Number.NaN, 12)).toBe(1)
  })
})

describe("quantizeWidth", () => {
  it("snaps to the step so resize drags do not re-render continuously", () => {
    expect(quantizeWidth(1003)).toBe(1008)
    expect(quantizeWidth(1006)).toBe(1008)
    expect(quantizeWidth(0)).toBe(0)
  })
})
