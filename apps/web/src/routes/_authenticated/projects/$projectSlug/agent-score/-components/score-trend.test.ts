import { describe, expect, it } from "vitest"
import { calendarEndingOn } from "./score-trend.tsx"

describe("calendarEndingOn", () => {
  it("builds an inclusive UTC range ending on the current score date", () => {
    expect(calendarEndingOn("2026-01-03", 3)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"])
  })
})
