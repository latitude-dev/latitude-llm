import { describe, expect, it } from "vitest"
import { chartThemeFallback } from "./chart-css-theme.ts"
import { buildChartOption, type ChartSeries } from "./chart-option.ts"

const colors = chartThemeFallback(false)

const barSeries = (length: number): readonly ChartSeries[] => [
  { kind: "bar", name: "cost", values: Array.from({ length }, () => 1), color: "#000" },
]

const labelInterval = (categoryCount: number) => {
  const option = buildChartOption({
    categories: Array.from({ length: categoryCount }, (_, index) => `c${index}`),
    series: barSeries(categoryCount),
    colors,
  })
  const xAxis = (option as { xAxis: { axisLabel: { interval: number | ((index: number) => boolean) } } }).xAxis
  return xAxis.axisLabel.interval
}

const labelledIndices = (categoryCount: number): number[] => {
  const interval = labelInterval(categoryCount)
  if (typeof interval === "number") {
    return Array.from({ length: categoryCount }, (_, index) => index).filter((index) => index % (interval + 1) === 0)
  }
  return Array.from({ length: categoryCount }, (_, index) => index).filter((index) => interval(index))
}

describe("category axis labels", () => {
  it("labels every category when they all fit", () => {
    expect(labelInterval(5)).toBe(0)
  })

  it("always labels the newest category once thinned", () => {
    for (const count of [7, 8, 12, 24, 31, 90]) {
      expect(labelledIndices(count)).toContain(count - 1)
    }
  })

  it("thins from the newest category, dropping the oldest labels", () => {
    // 8 day buckets: the trailing bucket keeps its label, spacing stays even.
    expect(labelledIndices(8)).toEqual([1, 3, 5, 7])
  })
})
