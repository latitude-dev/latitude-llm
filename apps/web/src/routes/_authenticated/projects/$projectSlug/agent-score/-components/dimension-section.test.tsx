// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DimensionSection } from "./dimension-section.tsx"

afterEach(cleanup)

const row = {
  id: "failure",
  label: "Terminal provider failure",
  description: "Observed across 24 sessions",
  value: "24 sessions",
  progress: 0.6,
  tone: "negative" as const,
  signal: false,
}

const healthy = {
  ...row,
  id: "coverage",
  label: "Completion reader",
  value: "100%",
  tone: "positive" as const,
}

describe("DimensionSection", () => {
  it("opens effects, keeps healthy evidence collapsed, and toggles both levels", () => {
    render(
      <DimensionSection
        id="outcome"
        title="Outcome quality"
        description="Did users accomplish what they came for?"
        score={20}
        affected={[row]}
        healthy={[healthy]}
      />,
    )

    expect(screen.getByText("Terminal provider failure")).toBeDefined()
    expect(screen.queryByText("Completion reader")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /Healthy, show/i }))
    expect(screen.getByText("Completion reader")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: /Collapse Outcome quality/ }))
    expect(screen.queryByText("Terminal provider failure")).toBeNull()
    expect(screen.queryByRole("button", { name: /Healthy/ })).toBeNull()
  })
})
