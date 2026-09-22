// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScoreDateNavigator } from "./score-date-navigator.tsx"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("ScoreDateNavigator", () => {
  it("steps across month boundaries by UTC date", () => {
    const onDateChange = vi.fn()
    render(<ScoreDateNavigator date="2026-03-01" onDateChange={onDateChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }))
    expect(onDateChange).toHaveBeenLastCalledWith("2026-02-28")
    fireEvent.click(screen.getByRole("button", { name: "Next day" }))
    expect(onDateChange).toHaveBeenLastCalledWith("2026-03-02")
  })

  it("selects a calendar day and prevents selecting future dates", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-20T00:30:00Z"))
    const onDateChange = vi.fn()
    render(<ScoreDateNavigator date="2026-09-20" onDateChange={onDateChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Score date (UTC)" }))
    expect(screen.getByRole("gridcell", { name: "21" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("gridcell", { name: "12" }))
    expect(onDateChange).toHaveBeenCalledExactlyOnceWith("2026-09-12")
    expect(screen.getByRole("button", { name: "Next day" }).hasAttribute("disabled")).toBe(true)
  })
})
