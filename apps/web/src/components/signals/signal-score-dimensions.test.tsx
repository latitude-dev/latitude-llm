// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SignalScoreDimensions } from "./signal-score-dimensions.tsx"

afterEach(cleanup)

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
})
