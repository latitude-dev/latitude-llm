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

  it("renders nothing for a diagnostic signal", () => {
    const { container } = render(<SignalScoreDimensions scoreEvidence={[]} />)

    expect(container.childElementCount).toBe(0)
  })

  it("uses neutral badges in a single non-wrapping row", () => {
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
    expect(screen.getByText("Outcome").parentElement?.className).toContain("bg-secondary")
  })
})
