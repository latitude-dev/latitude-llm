import { describe, expect, it } from "vitest"
import { presetsWithinBounds, TIME_PRESETS } from "./time-filter-dropdown.tsx"

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 7, 11, 12, 0, 0)
const idsOf = (presets: readonly { readonly id: string }[]) => presets.map((preset) => preset.id)

describe("presetsWithinBounds", () => {
  it("offers every preset when there are no bounds", () => {
    expect(presetsWithinBounds(TIME_PRESETS, {}, now)).toEqual(TIME_PRESETS)
  })

  it("drops presets that reach back before the bounds", () => {
    const offered = presetsWithinBounds(TIME_PRESETS, { minDate: new Date(now - 2 * DAY) }, now)

    expect(idsOf(offered)).toEqual(["last-30-seconds", "last-15-minutes", "last-30-minutes", "last-hour", "last-day"])
  })

  it("drops presets that land wholly past a stale upper bound", () => {
    // Data stopped 4 days ago: "Last day" would be offered and answer nothing, so the
    // only presets left are the ones long enough to still reach the covered band.
    const bounds = { minDate: new Date(now - 30 * DAY), maxDate: new Date(now - 4 * DAY) }

    expect(idsOf(presetsWithinBounds(TIME_PRESETS, bounds, now))).toEqual(["last-week", "last-2-weeks", "last-month"])
  })

  it("offers nothing when the bounds are narrower than the shortest preset", () => {
    const bounds = { minDate: new Date(now - 10 * 1000), maxDate: new Date(now - 5 * 1000) }

    expect(presetsWithinBounds(TIME_PRESETS, bounds, now)).toEqual([])
  })
})
