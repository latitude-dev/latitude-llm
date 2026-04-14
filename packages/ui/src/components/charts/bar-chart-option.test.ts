import { describe, expect, it } from "vitest"

import { buildBarChartOption } from "./bar-chart-option.ts"

const colors = {
  foreground: "#000",
  mutedForeground: "#666",
  border: "#ccc",
  primary: "#06f",
  tooltipBackground: "#fff",
  tooltipBorder: "#ccc",
} as const

describe("buildBarChartOption", () => {
  it("omits brush when selection is disabled", () => {
    const option = buildBarChartOption(["a"], [1], colors, undefined, true, false)
    expect(option.brush).toBeUndefined()
    expect(option.toolbox).toBeUndefined()
  })

  it("keeps brush enabled while hiding the brush toolbox UI only", () => {
    const option = buildBarChartOption(["a", "b"], [1, 2], colors, undefined, true, true)
    expect(option.brush).toMatchObject({
      brushMode: "single",
      xAxisIndex: 0,
    })
    expect(option.toolbox).toEqual({
      feature: {
        brush: { show: false },
      },
    })
  })
})
