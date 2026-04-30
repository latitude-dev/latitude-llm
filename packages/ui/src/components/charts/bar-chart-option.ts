/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"

import type { ChartCssThemeColors } from "./chart-css-theme.ts"

const maxCategoryAxisLabels = 6

/** Above this many categories, cap bar thickness so dense histograms stay readable. */
const barMaxWidthCategoryThreshold = 16
const barMaxWidthPx = 40
const gridVerticalInsetPx = 16

/**
 * Optional line series overlaid on the bars. Each line can target the
 * primary (left) y-axis or a secondary (right) one — caller decides.
 *
 * Multi-axis is opt-in: if every spec has `axis: 'left'` (or omitted),
 * the chart renders a single y-axis. If at least one spec has
 * `axis: 'right'`, a second y-axis is added and labelled with
 * `secondaryAxisName` if provided.
 */
export interface LineSeriesSpec {
  readonly name: string
  readonly values: readonly number[]
  readonly color: string
  readonly axis?: "left" | "right"
}

interface BarChartOptionExtras {
  /** Optional line overlays. */
  readonly lines?: readonly LineSeriesSpec[]
  /** Series name for the bars (legend label). Defaults to "Bars". */
  readonly primarySeriesName?: string
  /** Display name for the right y-axis (only used when at least one line targets it). */
  readonly secondaryAxisName?: string
}

export function buildBarChartOption(
  categories: readonly string[],
  values: readonly number[],
  tooltipCategories: readonly string[],
  colors: ChartCssThemeColors,
  formatTooltip?: (category: string, value: number) => string,
  showYAxis = true,
  enableBrush = false,
  xAxisLabelFontSize = 11,
  extras: BarChartOptionExtras = {},
): EChartsCoreOption {
  const { lines, primarySeriesName, secondaryAxisName } = extras
  const hasSecondaryAxis = !!lines?.some((l) => l.axis === "right")
  const showLegend = !!lines && lines.length > 0
  const categoryLabelInterval =
    categories.length <= maxCategoryAxisLabels
      ? 0
      : Math.max(1, Math.ceil(categories.length / maxCategoryAxisLabels)) - 1
  const capBarWidth = categories.length > barMaxWidthCategoryThreshold
  const splitLineColor = colors.isDark ? colors.mutedForeground : colors.border
  const splitLineOpacity = colors.isDark ? 0.3 : 0.6

  const yAxisBase = {
    type: "value" as const,
    minInterval: 1,
    splitLine: { lineStyle: { color: splitLineColor, type: "dashed" as const, opacity: splitLineOpacity } },
    axisLine: { show: false },
  }

  const yAxis = hasSecondaryAxis
    ? [
        {
          ...yAxisBase,
          ...(showYAxis ? {} : { axisTick: { show: false } }),
          axisLabel: showYAxis ? { color: colors.mutedForeground, fontSize: 11 } : { show: false },
        },
        {
          ...yAxisBase,
          name: secondaryAxisName ?? "",
          nameTextStyle: { color: colors.mutedForeground, fontSize: 10 },
          axisLabel: { color: colors.mutedForeground, fontSize: 11 },
          // The secondary axis sits opposite the primary (right edge).
          // Suppress its split lines so they don't double-stripe with the
          // primary's lines on dense charts.
          splitLine: { show: false },
        },
      ]
    : {
        ...yAxisBase,
        ...(showYAxis ? {} : { axisTick: { show: false } }),
        axisLabel: showYAxis ? { color: colors.mutedForeground, fontSize: 11 } : { show: false },
      }

  const barSeries = {
    name: primarySeriesName ?? "Bars",
    type: "bar" as const,
    data: [...values],
    ...(capBarWidth ? { barMaxWidth: barMaxWidthPx } : {}),
    barCategoryGap: "18%",
    cursor: "default" as const,
    yAxisIndex: 0,
    itemStyle: {
      color: colors.primary,
      borderRadius: [4, 4, 0, 0] as [number, number, number, number],
    },
    emphasis: {
      itemStyle: {
        color: colors.primary,
        borderRadius: [4, 4, 0, 0] as [number, number, number, number],
      },
    },
  }

  const lineSeries = (lines ?? []).map((line) => ({
    name: line.name,
    type: "line" as const,
    data: [...line.values],
    smooth: false,
    showSymbol: false,
    yAxisIndex: hasSecondaryAxis && line.axis === "right" ? 1 : 0,
    lineStyle: { width: 2, color: line.color },
    itemStyle: { color: line.color },
    emphasis: { lineStyle: { width: 2.5 } },
  }))

  // Pad the top of the grid when the legend is rendered so the legend
  // strip doesn't overlap the highest bar. ECharts measures the legend
  // height itself, but `grid.top` is the only knob exposed for the
  // gap; 28 is enough room for one row of the chip-style legend.
  const gridTop = showLegend ? 28 : gridVerticalInsetPx
  // Reserve a touch of right-side padding for the secondary axis labels
  // when present.
  const gridRight = hasSecondaryAxis ? 48 : 16

  const option: EChartsCoreOption = {
    backgroundColor: "transparent",
    grid: {
      left: showYAxis ? 48 : 8,
      right: gridRight,
      top: gridTop,
      bottom: gridVerticalInsetPx,
      containLabel: false,
    },
    legend: showLegend
      ? {
          top: 0,
          textStyle: { color: colors.mutedForeground, fontSize: 11 },
          itemWidth: 12,
          itemHeight: 8,
          itemGap: 14,
        }
      : { show: false },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
        shadowStyle: {
          color: colors.foreground,
          opacity: 0.06,
        },
      },
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      textStyle: { color: colors.foreground, fontSize: 12 },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { name?: string; dataIndex?: number } | undefined
        const dataIndex = typeof first?.dataIndex === "number" ? first.dataIndex : 0
        const tooltipCategory = tooltipCategories[dataIndex] ?? first?.name ?? ""
        // Single-series formatter path (preserves the original
        // `formatTooltip` API for the bars-only case).
        if (!showLegend) {
          const v = list[0] as { value?: number } | undefined
          const value = typeof v?.value === "number" ? v.value : Number(v?.value ?? 0)
          return formatTooltip ? formatTooltip(tooltipCategory, value) : `${tooltipCategory}<br/><b>${value}</b>`
        }
        const rows = list.map((p) => {
          const item = p as { seriesName?: string; value?: number; marker?: string }
          const value = typeof item.value === "number" ? item.value : Number(item.value ?? 0)
          return `${item.marker ?? ""} ${item.seriesName ?? ""} <b>${value}</b>`
        })
        return `${tooltipCategory}<br/>${rows.join("<br/>")}`
      },
    },
    xAxis: {
      type: "category",
      data: [...categories],
      axisLine: { lineStyle: { color: colors.border } },
      axisLabel: {
        color: colors.mutedForeground,
        fontSize: xAxisLabelFontSize,
        rotate: 0,
        interval: categoryLabelInterval,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true, lineStyle: { color: colors.border } },
    },
    yAxis,
    series: [barSeries, ...lineSeries],
  }

  if (enableBrush) {
    option.toolbox = {
      show: false,
    }
    option.brush = {
      brushMode: "single",
      transformable: false,
      throttleType: "debounce",
      throttleDelay: 50,
      brushStyle: {
        borderWidth: 0,
        color: colors.primary,
        opacity: 0.3,
      },
      xAxisIndex: 0,
    }
  }

  return option
}
