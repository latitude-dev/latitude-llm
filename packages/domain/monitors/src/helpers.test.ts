import { describe, expect, it } from "vitest"
import { formatHumanReadableAlert } from "./helpers.ts"

describe("formatHumanReadableAlert", () => {
  it("formats saved-search match alerts with the saved search name", () => {
    expect(
      formatHumanReadableAlert({ kind: "savedSearch.match", condition: null }, { savedSearchName: "failed payments" }),
    ).toBe("Opens an incident each time a new match is detected for failed payments.")
  })

  it("formats unnamed saved-search match alerts with the provided fallback", () => {
    expect(
      formatHumanReadableAlert({ kind: "savedSearch.match", condition: null }, { savedSearchName: "this search" }),
    ).toBe("Opens an incident each time a new match is detected for this search.")
  })
})
