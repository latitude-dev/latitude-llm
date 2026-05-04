/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"

import type { ChartCssThemeColors } from "./chart-css-theme.ts"

const maxCategoryAxisLabels = 6
/** Above this many categories, cap bar thickness so dense histograms stay readable. */
const barMaxWidthCategoryThreshold = 16
const barMaxWidthPx = 40
const gridVerticalInsetPx = 16

/**
 * Bar series. `stack` groups bars vertically at each category — overlays
 * sharing the same `stack` key stack together, and ECharts groups
 * distinct stacks (or unstacked bars) side-by-side.
 */
export interface ChartBarSeries {
  readonly kind: "bar"
  readonly name: string
  readonly values: readonly number[]
  readonly color: string
  readonly axis?: "left" | "right"
  readonly stack?: string
}

/**
 * Line series. Set `area: true` to fill under the line (an area chart).
 * Set `stack` to stack with sibling lines that share the key — combined
 * with `area: true` this is the standard "stacked area" composition.
 */
export interface ChartLineSeries {
  readonly kind: "line"
  readonly name: string
  readonly values: readonly number[]
  readonly color: string
  readonly axis?: "left" | "right"
  readonly stack?: string
  readonly area?: boolean
  readonly smooth?: boolean
}

export type ChartSeries = ChartBarSeries | ChartLineSeries

export interface ChartAxisDescriptor {
  /** Axis label shown adjacent to the values. */
  readonly name?: string
}

interface ChartOptionInput {
  readonly categories: readonly string[]
  readonly series: readonly ChartSeries[]
  readonly colors: ChartCssThemeColors
  readonly primaryAxis?: ChartAxisDescriptor
  readonly secondaryAxis?: ChartAxisDescriptor
  /**
   * Custom tooltip title formatter. Receives the X-axis category for
   * the hovered point + the index into `categories`. Defaults to the
   * raw category string.
   */
  readonly tooltipTitle?: (category: string, dataIndex: number) => string
  readonly xAxisLabelFontSize?: number
}

export function buildChartOption(input: ChartOptionInput): EChartsCoreOption {
  const { categories, series, colors, primaryAxis, secondaryAxis, tooltipTitle, xAxisLabelFontSize = 11 } = input

  const hasSecondaryAxis = series.some((s) => s.axis === "right")
  const showLegend = series.length > 1
  const hasBarSeries = series.some((s) => s.kind === "bar")

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
    axisLabel: { color: colors.mutedForeground, fontSize: 11 },
  }

  const yAxis = hasSecondaryAxis
    ? [
        {
          ...yAxisBase,
          ...(primaryAxis?.name
            ? { name: primaryAxis.name, nameTextStyle: { color: colors.mutedForeground, fontSize: 10 } }
            : {}),
        },
        {
          ...yAxisBase,
          // Suppress the secondary's split lines so they don't double-stripe
          // with the primary's lines on dense charts.
          splitLine: { show: false },
          ...(secondaryAxis?.name
            ? { name: secondaryAxis.name, nameTextStyle: { color: colors.mutedForeground, fontSize: 10 } }
            : {}),
        },
      ]
    : yAxisBase

  // Reserve a touch of right-side padding for the secondary axis labels
  // when present, and a top strip when the legend renders.
  const gridTop = showLegend ? 28 : gridVerticalInsetPx
  const gridRight = hasSecondaryAxis ? 48 : 16

  // Build the series list. Per-kind shape choices:
  //  - `emphasis.disabled` keeps every series at full opacity on hover
  //    (echarts' default fades non-hovered series to ~10%).
  //  - bar borderRadius rounds the top corners only on unstacked bars
  //    so stacks read as a continuous slab.
  //  - lines hide point symbols by default; the tooltip axis pointer
  //    handles "where is this value" affordances.
  const echartsSeries = series.map((s) => {
    const yAxisIndex = hasSecondaryAxis && s.axis === "right" ? 1 : 0
    if (s.kind === "bar") {
      return {
        name: s.name,
        type: "bar" as const,
        data: [...s.values],
        yAxisIndex,
        ...(s.stack ? { stack: s.stack } : {}),
        ...(capBarWidth ? { barMaxWidth: barMaxWidthPx } : {}),
        barCategoryGap: "18%" as const,
        cursor: "default" as const,
        itemStyle: {
          color: s.color,
          ...(s.stack ? {} : { borderRadius: [3, 3, 0, 0] as [number, number, number, number] }),
        },
        emphasis: { disabled: true },
      }
    }
    return {
      name: s.name,
      type: "line" as const,
      data: [...s.values],
      yAxisIndex,
      ...(s.stack ? { stack: s.stack } : {}),
      smooth: s.smooth ?? false,
      showSymbol: false,
      lineStyle: { width: s.area ? 1 : 2, color: s.color, opacity: s.area ? 0.8 : 1 },
      itemStyle: { color: s.color },
      ...(s.area ? { areaStyle: { color: s.color, opacity: 0.45 } } : {}),
      emphasis: { disabled: true },
    }
  })

  return {
    backgroundColor: "transparent",
    grid: {
      left: 48,
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
      // Bar-driven charts read better with a soft shadow; pure line/area
      // charts get a thin axis line marker.
      axisPointer: hasBarSeries
        ? {
            type: "shadow" as const,
            shadowStyle: { color: colors.foreground, opacity: 0.06 },
          }
        : { type: "line" as const, lineStyle: { color: colors.foreground, opacity: 0.2 } },
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      textStyle: { color: colors.foreground, fontSize: 12 },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { name?: string; dataIndex?: number } | undefined
        const dataIndex = typeof first?.dataIndex === "number" ? first.dataIndex : 0
        const rawCategory = first?.name ?? ""
        const title = tooltipTitle ? tooltipTitle(rawCategory, dataIndex) : rawCategory
        const rows = list.map((p) => {
          const item = p as { seriesName?: string; value?: number; marker?: string }
          const value = typeof item.value === "number" ? item.value : Number(item.value ?? 0)
          return `${item.marker ?? ""} ${item.seriesName ?? ""} <b>${value}</b>`
        })
        return `${title}<br/>${rows.join("<br/>")}`
      },
    },
    xAxis: {
      type: "category" as const,
      // `boundaryGap: true` reserves half-a-category padding on either
      // side, which is what bars expect. For pure line/area charts that
      // padding looks awkward — drop it.
      boundaryGap: hasBarSeries,
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
    series: echartsSeries,
  }
}
