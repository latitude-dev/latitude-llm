// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AdminAgentScoreHistoryPointDto } from "../../../../domains/admin/agent-score.functions.ts"
import { adminSeedAgentScoreHistory } from "../../../../domains/admin/agent-score.functions.ts"
import { AgentScoreSeedHistoryButton, generateScoreCurve, writeSummary } from "./agent-score-seed-history-button.tsx"

vi.mock("../../../../domains/admin/agent-score.functions.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../domains/admin/agent-score.functions.ts")>()),
  adminSeedAgentScoreHistory: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }))

beforeEach(() => {
  vi.mocked(adminSeedAgentScoreHistory).mockResolvedValue({ written: 28, skipped: 2 })
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const CURRENT_DATE = "2026-09-18"

const historyPoint = (date: string, score: number): AdminAgentScoreHistoryPointDto => ({
  date,
  score,
  scoringVersion: "agent-score-v6-provisional",
  windowDays: 14,
  eligibleSessionCount: 1_234,
})

const open = (history: readonly AdminAgentScoreHistoryPointDto[] = []) => {
  render(
    <AgentScoreSeedHistoryButton
      projectId={"p".repeat(24)}
      projectName="Support Agent"
      currentDate={CURRENT_DATE}
      history={history}
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: "Seed score history" }))
}

const confirm = () => {
  fireEvent.change(screen.getByPlaceholderText("seed score history"), { target: { value: "seed score history" } })
}

describe("generateScoreCurve", () => {
  it("walks from start to end across the range", () => {
    const curve = generateScoreCurve({ dayCount: 30, start: 40, end: 80, volatility: 0, random: () => 0.5 })

    expect(curve[0]).toBe(40)
    expect(curve.at(-1)).toBe(80)
  })

  it("stays inside 0–100 even when volatility would overshoot", () => {
    const curve = generateScoreCurve({ dayCount: 30, start: 2, end: 99, volatility: 40, random: Math.random })

    expect(curve.every((value) => value >= 0 && value <= 100)).toBe(true)
  })

  it("keeps one decimal, so a slider value survives the round trip", () => {
    const curve = generateScoreCurve({ dayCount: 10, start: 61.37, end: 79.44, volatility: 3, random: Math.random })

    expect(curve.every((value) => Math.round(value * 10) === value * 10)).toBe(true)
  })

  it("drifts rather than jittering, so consecutive days stay related", () => {
    const curve = generateScoreCurve({ dayCount: 30, start: 60, end: 60, volatility: 5, random: Math.random })
    const steps = curve.slice(1).map((value, index) => Math.abs(value - curve[index]!))

    // A damped walk moves less between neighbours than the full ±volatility an independent draw would.
    expect(Math.max(...steps)).toBeLessThan(2 * 5)
  })
})

describe("writeSummary", () => {
  it("mentions the locked days only when there are some", () => {
    expect(writeSummary(30, 30)).toBe("Will write 30 days.")
    expect(writeSummary(29, 30)).toBe("Will write 29 days. 1 day already has a published score and will be left alone.")
    expect(writeSummary(1, 30)).toBe("Will write 1 day. 29 days already have a published score and will be left alone.")
  })
})

describe("AgentScoreSeedHistoryButton", () => {
  it("offers one slider per day in the 30-day window ending today", () => {
    open()

    expect(screen.getAllByRole("slider")).toHaveLength(30)
    expect(screen.getByText("Will write 30 days.")).toBeDefined()
  })

  it("locks the days that already carry a published score and shows their real value", () => {
    open([historyPoint("2026-09-17", 74.4), historyPoint("2026-09-10", 61)])

    const locked = screen.getAllByRole("slider").filter((slider) => slider.getAttribute("data-disabled") !== null)
    expect(locked).toHaveLength(2)
    expect(screen.getByTitle(/Sep 17, 2026: 74.4 — already published/)).toBeDefined()
    expect(
      screen.getByText("Will write 28 days. 2 days already have a published score and will be left alone."),
    ).toBeDefined()
  })

  it("submits only the unpublished days, and never a locked one", async () => {
    open([historyPoint("2026-09-17", 74.4)])
    confirm()
    fireEvent.click(screen.getByRole("button", { name: "Seed 29 days" }))

    await waitFor(() => expect(adminSeedAgentScoreHistory).toHaveBeenCalled())
    const { days, confirmation } = vi.mocked(adminSeedAgentScoreHistory).mock.calls[0]![0].data

    expect(confirmation).toBe("seed score history")
    expect(days).toHaveLength(29)
    expect(days.some((day) => day.date === "2026-09-17")).toBe(false)
    expect(days.at(-1)?.date).toBe(CURRENT_DATE)
    expect(days.every((day) => day.score >= 0 && day.score <= 100)).toBe(true)
  })

  it("will not submit until the confirmation phrase is typed", () => {
    open()

    expect(screen.getByRole("button", { name: "Seed 30 days" }).hasAttribute("disabled")).toBe(true)
    confirm()
    expect(screen.getByRole("button", { name: "Seed 30 days" }).hasAttribute("disabled")).toBe(false)
  })

  it("has nothing to submit when every day is already published", () => {
    const everyDay = Array.from({ length: 30 }, (_, index) =>
      historyPoint(new Date(Date.UTC(2026, 7, 20 + index)).toISOString().slice(0, 10), 70),
    )
    open(everyDay)
    confirm()

    expect(screen.getByRole("button", { name: "Seed 0 days" }).hasAttribute("disabled")).toBe(true)
  })

  it("regenerating the curve changes the drafted values", () => {
    open()
    const before = screen.getAllByRole("slider").map((slider) => slider.getAttribute("aria-valuenow"))

    fireEvent.click(screen.getByRole("button", { name: "Generate curve" }))

    const after = screen.getAllByRole("slider").map((slider) => slider.getAttribute("aria-valuenow"))
    expect(after).not.toEqual(before)
  })
})
