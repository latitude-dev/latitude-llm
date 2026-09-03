// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { SignalScoreDimensions } from "./signal-score-dimensions.tsx"

afterEach(cleanup)

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterAll(() => vi.unstubAllGlobals())

describe("SignalScoreDimensions", () => {
  it("renders unique dimensions in canonical order", () => {
    render(
      <SignalScoreDimensions
        scoreEvidence={[
          { scoreDimension: "speed", role: "criticalPathEfficiency" },
          { scoreDimension: "reliability", role: "completionOutcome" },
          { scoreDimension: "outcome", role: "taskOutcome" },
          { scoreDimension: "reliability", role: "operationalIncident" },
        ]}
      />,
    )

    const chips = within(screen.getByLabelText("Agent Score dimensions")).getAllByText(/.+/)
    expect(chips.map((chip) => chip.textContent)).toEqual(["Outcome", "Reliability", "Speed"])
  })

  it("marks a signal without scoring roles as diagnostic", () => {
    render(<SignalScoreDimensions scoreEvidence={[]} />)

    const badgeClassName = screen.getByText("Diagnostic").parentElement?.className
    expect(badgeClassName).toContain("bg-muted")
    expect(badgeClassName).toContain("font-normal")
  })

  it("treats an ignored signal as diagnostic even when roles are stored", () => {
    const scoreEvidence = [
      { scoreDimension: "outcome", role: "taskOutcome" },
      { scoreDimension: "safety", role: "exposure" },
    ] as const
    const { rerender } = render(<SignalScoreDimensions ignored scoreEvidence={scoreEvidence} />)

    expect(screen.getByText("Diagnostic")).toBeTruthy()
    expect(screen.queryByText("Outcome")).toBeNull()
    expect(screen.queryByText("Safety")).toBeNull()

    rerender(<SignalScoreDimensions ignored scoreEvidence={scoreEvidence} wrap={false} />)
    expect(screen.getByText("Diagnostic")).toBeTruthy()
    expect(screen.queryByLabelText("Agent Score dimensions")).toBeNull()
  })

  it("uses visible regular-weight badges in a single non-wrapping row", () => {
    render(
      <SignalScoreDimensions
        scoreEvidence={[
          { scoreDimension: "outcome", role: "taskOutcome" },
          { scoreDimension: "cost", role: "spendEfficiency" },
        ]}
        wrap={false}
      />,
    )

    const list = screen.getByLabelText("Agent Score dimensions")
    expect(list.className).toContain("overflow-hidden")
    expect(list.className).not.toContain("flex-wrap")
    const badgeClassName = screen.getByText("Outcome").parentElement?.className
    expect(badgeClassName).toContain("bg-muted")
    expect(badgeClassName).toContain("font-normal")
  })

  it("keeps detail and table surfaces on the same dimension set", () => {
    const scoreEvidence = [
      { scoreDimension: "safety", role: "exposure" },
      { scoreDimension: "reliability", role: "completionOutcome" },
      { scoreDimension: "outcome", role: "taskOutcome" },
      { scoreDimension: "reliability", role: "operationalIncident" },
    ] as const
    const { rerender } = render(<SignalScoreDimensions scoreEvidence={scoreEvidence} />)
    const detailDimensions = Array.from(
      screen.getByLabelText("Agent Score dimensions").querySelectorAll("[data-dimension-item]"),
    ).map((chip) => chip.textContent)

    rerender(<SignalScoreDimensions scoreEvidence={scoreEvidence} wrap={false} />)
    const tableDimensions = Array.from(
      screen.getByLabelText("Agent Score dimensions").querySelectorAll("[data-dimension-item]"),
    ).map((chip) => chip.textContent)

    expect(detailDimensions).toEqual(["Outcome", "Reliability", "Safety"])
    expect(tableDimensions).toEqual(detailDimensions)
  })
})
