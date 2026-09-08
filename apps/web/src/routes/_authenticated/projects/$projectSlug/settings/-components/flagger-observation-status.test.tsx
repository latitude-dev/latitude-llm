// @vitest-environment jsdom
import type { FlaggerCoverageRow } from "@domain/flaggers"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FlaggerObservationStatus } from "./flagger-observation-status.tsx"

afterEach(cleanup)

const coverage: FlaggerCoverageRow = {
  flaggerSlug: "frustration",
  eligibleSessions: 1_000,
  decidedSessions: 1_000,
  examinedSessions: 120,
  readableSessions: 110,
  readableShare: 0.11,
  selectionPaths: {
    deterministic: 0,
    hinted: 20,
    uniformSample: 0,
    ordinarySample: 980,
    skipped: 0,
    rateLimited: 0,
  },
  positiveFindings: 8,
  calibrationReadyFindings: 7,
  unknownSelectionProbability: 10,
  missingTelemetry: 0,
}

describe("FlaggerObservationStatus", () => {
  it("keeps the recent observation summary compact by default", () => {
    render(<FlaggerObservationStatus flaggerSlug="frustration" coverage={coverage} />)

    expect(screen.getByText("Observed 120 of 1,000 sessions · 28 days")).toBeDefined()
    expect(screen.queryByText("Eligible sessions")).toBeNull()
  })

  it("reveals the diagnostic breakdown on request", () => {
    render(<FlaggerObservationStatus flaggerSlug="frustration" coverage={coverage} />)

    fireEvent.click(screen.getByRole("button", { name: /Observed 120/ }))

    expect(screen.getByText("Eligible sessions")).toBeDefined()
    expect(screen.getByText("110 (11%)")).toBeDefined()
    expect(screen.getByText("Hinted 20 · Random sample 980")).toBeDefined()
    expect(screen.getByText("Incomplete sampling data 10")).toBeDefined()
  })

  it("only elevates a concrete rate-limit problem", () => {
    render(
      <FlaggerObservationStatus
        flaggerSlug="frustration"
        coverage={{
          ...coverage,
          selectionPaths: { ...coverage.selectionPaths, rateLimited: 3 },
        }}
      />,
    )

    expect(screen.getByText("· Rate limited").className).toContain("text-warning-muted-foreground")
  })

  it("does not turn an empty project into an analytics report", () => {
    render(
      <FlaggerObservationStatus
        flaggerSlug="frustration"
        coverage={{ ...coverage, eligibleSessions: 0, examinedSessions: 0, readableSessions: 0, readableShare: 0 }}
      />,
    )

    expect(screen.getByText("Waiting for production sessions")).toBeDefined()
  })
})
