import { describe, expect, it } from "vitest"
import { projectCentroidsTo2D } from "./centroid-projection.ts"

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe("projectCentroidsTo2D", () => {
  it("returns an empty map for no centroids", () => {
    expect(projectCentroidsTo2D(new Map()).size).toBe(0)
  })

  it("collapses a single centroid to the center", () => {
    const result = projectCentroidsTo2D(new Map([["a", [1, 0, 0]]]))
    expect(result.get("a")).toEqual({ x: 0.5, y: 0.5 })
  })

  it("keeps semantically close vectors closer than distant ones", () => {
    const result = projectCentroidsTo2D(
      new Map([
        ["billing-1", [1, 0, 0, 0.05]],
        ["billing-2", [0.98, 0.05, 0, 0]],
        ["auth", [0, 1, 0, 0]],
        ["exports", [0, 0, 1, 0.1]],
      ]),
    )
    const billing1 = result.get("billing-1")
    const billing2 = result.get("billing-2")
    const auth = result.get("auth")
    if (!billing1 || !billing2 || !auth) throw new Error("missing projections")
    expect(distance(billing1, billing2)).toBeLessThan(distance(billing1, auth))
    expect(distance(billing1, billing2)).toBeLessThan(distance(billing2, auth))
  })

  it("normalizes every coordinate into [0, 1]", () => {
    const result = projectCentroidsTo2D(
      new Map([
        ["a", [5, 1, -3]],
        ["b", [-2, 4, 0]],
        ["c", [0, -1, 7]],
        ["d", [3, 3, 3]],
      ]),
    )
    for (const point of result.values()) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
    }
  })

  it("is deterministic across calls", () => {
    const input = new Map([
      ["a", [1, 2, 3]],
      ["b", [3, 2, 1]],
      ["c", [-1, 0, 2]],
    ])
    const first = projectCentroidsTo2D(input)
    const second = projectCentroidsTo2D(input)
    expect(first).toEqual(second)
  })

  it("skips vectors whose dimensionality differs from the majority", () => {
    const result = projectCentroidsTo2D(
      new Map([
        ["a", [1, 0, 0]],
        ["b", [0, 1, 0]],
        ["mismatched", [1, 0]],
      ]),
    )
    expect(result.has("a")).toBe(true)
    expect(result.has("b")).toBe(true)
    expect(result.has("mismatched")).toBe(false)
  })

  it("centers identical vectors instead of dividing by zero", () => {
    const result = projectCentroidsTo2D(
      new Map([
        ["a", [1, 1]],
        ["b", [1, 1]],
      ]),
    )
    expect(result.get("a")).toEqual({ x: 0.5, y: 0.5 })
    expect(result.get("b")).toEqual({ x: 0.5, y: 0.5 })
  })
})
