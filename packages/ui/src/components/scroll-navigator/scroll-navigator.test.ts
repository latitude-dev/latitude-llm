import { describe, expect, it } from "vitest"
import { resolveNavigationTarget } from "./scroll-navigator.tsx"

const scrollPaddingTop = 16

const metrics = [
  { top: 32, bottom: 132 },
  { top: 156, bottom: 356 },
  { top: 380, bottom: 480 },
] as const

describe("resolveNavigationTarget", () => {
  it("returns null when there are no items", () => {
    expect(
      resolveNavigationTarget({
        metrics: [],
        scrollTop: 0,
        clientHeight: 200,
        scrollHeight: 200,
        direction: "down",
        scrollPaddingTop,
      }),
    ).toBeNull()
  })

  it("scrolls up to the clipped item's top before moving to the previous item", () => {
    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 220,
        clientHeight: 200,
        scrollHeight: 700,
        direction: "up",
        scrollPaddingTop,
      }),
    ).toEqual({ index: 1, top: 140 })
  })

  it("scrolls down to the next item's top when the current top item is clipped", () => {
    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 220,
        clientHeight: 200,
        scrollHeight: 700,
        direction: "down",
        scrollPaddingTop,
      }),
    ).toEqual({ index: 2, top: 364 })
  })

  it("moves between adjacent item tops when the current item is already aligned", () => {
    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 156,
        clientHeight: 200,
        scrollHeight: 700,
        direction: "up",
        scrollPaddingTop,
      }),
    ).toEqual({ index: 0, top: 16 })

    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 156,
        clientHeight: 200,
        scrollHeight: 700,
        direction: "down",
        scrollPaddingTop,
      }),
    ).toEqual({ index: 2, top: 364 })
  })

  it("treats the first fully visible item as current when the viewport top is between items", () => {
    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 140,
        clientHeight: 200,
        scrollHeight: 700,
        direction: "up",
        scrollPaddingTop,
      }),
    ).toEqual({ index: 0, top: 16 })

    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 140,
        clientHeight: 200,
        scrollHeight: 700,
        direction: "down",
        scrollPaddingTop,
      }),
    ).toEqual({ index: 2, top: 364 })
  })

  it("clamps the next item target to the container's max scroll position", () => {
    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 156,
        clientHeight: 200,
        scrollHeight: 520,
        direction: "down",
        scrollPaddingTop,
      }),
    ).toEqual({ index: 2, top: 320 })
  })

  it("clamps to zero when padding would scroll above the start", () => {
    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 156,
        clientHeight: 200,
        scrollHeight: 700,
        direction: "up",
        scrollPaddingTop: 48,
      }),
    ).toEqual({ index: 0, top: 0 })
  })

  it("advances from a pending target index instead of recomputing from the live scroll position", () => {
    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 140,
        clientHeight: 200,
        scrollHeight: 700,
        direction: "down",
        scrollPaddingTop,
        fromIndex: 1,
      }),
    ).toEqual({ index: 2, top: 364 })
  })

  it("lets reverse clicks subtract from the pending target index", () => {
    expect(
      resolveNavigationTarget({
        metrics,
        scrollTop: 220,
        clientHeight: 200,
        scrollHeight: 700,
        direction: "up",
        scrollPaddingTop,
        fromIndex: 2,
      }),
    ).toEqual({ index: 1, top: 140 })
  })
})
