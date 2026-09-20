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

  it("accepts a selected date and rejects empty and future values", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-20T00:30:00Z"))
    const onDateChange = vi.fn()
    render(<ScoreDateNavigator date="2026-09-20" onDateChange={onDateChange} />)
    const input = screen.getByLabelText("Score date (UTC)")
    fireEvent.change(input, { target: { value: "2026-09-12" } })
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.change(input, { target: { value: "2026-09-21" } })
    expect(onDateChange).toHaveBeenCalledExactlyOnceWith("2026-09-12")
    expect(screen.getByRole("button", { name: "Next day" }).hasAttribute("disabled")).toBe(true)
  })
})
