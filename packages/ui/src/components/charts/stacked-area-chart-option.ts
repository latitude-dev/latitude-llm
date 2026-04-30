/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"

import type { ChartCssThemeColors } from "./chart-css-theme.ts"

const maxCategoryAxisLabels = 6
const gridVerticalInsetPx = 16

/**
 * One stacked layer in the area chart. `values` must be the same length
 * as the chart's `categories`. Caller picks colours — the chart doesn't
 * know which layer is which semantically.
 */
export interface StackedAreaSeriesSpec {
  readonly name: string
  readonly values: readonly number[]
  readonly color: string
}

interface StackedAreaChartOptionExtras {
  readonly tooltipTitle?: (category: string, dataIndex: number) => string
}

export function buildStackedAreaChartOption(
  categories: readonly string[],
  series: readonly StackedAreaSeriesSpec[],
  colors: ChartCssThemeColors,
  extras: StackedAreaChartOptionExtras = {},
): EChartsCoreOption {
  const categoryLabelInterval =
    categories.length <= maxCategoryAxisLabels
      ? 0
      : Math.max(1, Math.ceil(categories.length / maxCategoryAxisLabels)) - 1
  const splitLineColor = colors.isDark ? colors.mutedForeground : colors.border
  const splitLineOpacity = colors.isDark ? 0.3 : 0.6

  return {
    backgroundColor: "transparent",
    grid: {
      left: 48,
      right: 16,
      top: 28, // legend strip
      bottom: gridVerticalInsetPx,
      containLabel: false,
    },
    legend: {
      top: 0,
      textStyle: { color: colors.mutedForeground, fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 14,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: colors.foreground, opacity: 0.2 } },
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      textStyle: { color: colors.foreground, fontSize: 12 },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { name?: string; dataIndex?: number } | undefined
        const dataIndex = typeof first?.dataIndex === "number" ? first.dataIndex : 0
        const title = extras.tooltipTitle ? extras.tooltipTitle(first?.name ?? "", dataIndex) : (first?.name ?? "")
        const rows = list.map((p) => {
          const item = p as { seriesName?: string; value?: number; marker?: string }
          const value = typeof item.value === "number" ? item.value : Number(item.value ?? 0)
          return `${item.marker ?? ""} ${item.seriesName ?? ""} <b>${value}</b>`
        })
        return `${title}<br/>${rows.join("<br/>")}`
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: [...categories],
      axisLine: { lineStyle: { color: colors.border } },
      axisLabel: {
        color: colors.mutedForeground,
        fontSize: 11,
        rotate: 0,
        interval: categoryLabelInterval,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true, lineStyle: { color: colors.border } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: splitLineColor, type: "dashed", opacity: splitLineOpacity } },
      axisLine: { show: false },
      axisLabel: { color: colors.mutedForeground, fontSize: 11 },
    },
    series: series.map((s) => ({
      name: s.name,
      type: "line" as const,
      stack: "total",
      smooth: false,
      showSymbol: false,
      data: [...s.values],
      lineStyle: { width: 1, color: s.color, opacity: 0.8 },
      itemStyle: { color: s.color },
      areaStyle: { color: s.color, opacity: 0.45 },
      // Default echarts behaviour fades the unhovered layers to ~10%
      // opacity, which makes a stacked composition unreadable — every
      // layer carries information at all times. Disable emphasis so
      // hover only drives the tooltip, not visual dimming.
      emphasis: { disabled: true },
    })),
  }
}
