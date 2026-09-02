// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  parseSignalScoreDimensions,
  ScoreDimensionFilter,
  serializeSignalScoreDimensions,
} from "./score-dimension-filter.tsx"

afterEach(cleanup)

describe("signal score dimension filter state", () => {
  it("drops invalid URL values, deduplicates, and restores canonical order", () => {
    expect(parseSignalScoreDimensions("speed,invalid,outcome,speed,reliability")).toEqual([
      "outcome",
      "reliability",
      "speed",
    ])
  })

  it("serializes selected dimensions in canonical order", () => {
    expect(serializeSignalScoreDimensions(["safety", "cost", "outcome", "cost"])).toBe("outcome,cost,safety")
  })

  it("summarizes the active selection in the trigger", () => {
    const onChange = () => undefined
    const { rerender } = render(<ScoreDimensionFilter value={["cost"]} onChange={onChange} />)

    expect(screen.getByRole("button").textContent).toContain("Cost")

    rerender(<ScoreDimensionFilter value={["cost", "speed"]} onChange={onChange} />)
    expect(screen.getByRole("button").textContent).toContain("2 dimensions")
  })
})
