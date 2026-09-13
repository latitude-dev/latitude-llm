// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DimensionSection, DimensionSectionSkeleton } from "./dimension-section.tsx"

afterEach(cleanup)

const row = {
  id: "failure",
  label: "Terminal provider failure",
  description: "Observed across 24 sessions",
  value: "24 sessions",
  progress: 0.6,
  tone: "negative" as const,
  details: [{ label: "Scoring window", value: "Last 7 days" }],
}

const healthy = {
  ...row,
  id: "coverage",
  label: "Completion reader",
  value: "100%",
  tone: "positive" as const,
}

const summary = {
  id: "coverage-summary",
  label: "Readable completion outcomes",
  value: "84%",
  progress: 0.16,
  tone: "neutral" as const,
}

describe("DimensionSection", () => {
  it("keeps the ring and text layout visible while loading", () => {
    render(<DimensionSectionSkeleton />)

    expect(screen.getByLabelText("Loading score dimension").getAttribute("aria-busy")).toBe("true")
  })

  it("opens effects, keeps healthy evidence collapsed, and toggles both levels", () => {
    render(
      <DimensionSection
        id="outcome"
        title="Outcome quality"
        description="Did users accomplish what they came for?"
        score={20}
        projectId="project-1"
        projectSlug="project-one"
        affected={[row]}
        healthy={[healthy]}
        context={[]}
        coverage={[summary]}
      />,
    )

    expect(screen.getByText("Terminal provider failure")).toBeDefined()
    expect(screen.queryByText("Readable completion outcomes")).toBeNull()
    expect(screen.queryByText("Completion reader")).toBeNull()
    expect(screen.queryByRole("button", { name: "Readable completion outcomes" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Terminal provider failure" }))
    expect(screen.getByText("Observed across 24 sessions")).toBeDefined()
    expect(screen.getByText("Scoring window")).toBeDefined()
    expect(screen.getByText("Last 7 days")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: /Healthy, show/i }))
    expect(screen.getByText("Completion reader")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: /Data coverage, show/i }))
    expect(screen.getByText("Readable completion outcomes")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: /Collapse Outcome quality/ }))
    expect(screen.queryByText("Terminal provider failure")).toBeNull()
    expect(screen.queryByRole("button", { name: /Healthy/ })).toBeNull()
  })
})
