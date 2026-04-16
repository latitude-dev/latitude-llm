/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"

import type { ChartCssThemeColors } from "./chart-css-theme.ts"

const maxCategoryAxisLabels = 6

/** Above this many categories, cap bar thickness so dense histograms stay readable. */
const barMaxWidthCategoryThreshold = 16
const barMaxWidthPx = 40
const gridVerticalInsetPx = 16

export function buildBarChartOption(
  categories: readonly string[],
  values: readonly number[],
  tooltipCategories: readonly string[],
  colors: ChartCssThemeColors,
  formatTooltip?: (category: string, value: number) => string,
  showYAxis = true,
  enableBrush = false,
  xAxisLabelFontSize = 11,
  /** Per-bar fill; index aligns with `values`. Omitted entries use `colors.primary`. */
  itemColors?: readonly (string | undefined)[],
  /** When false, hides category labels, ticks, and axis line (sparkline-style). */
  showXAxisLabels = true,
): EChartsCoreOption {
  const categoryLabelInterval =
    categories.length <= maxCategoryAxisLabels
      ? 0
      : Math.max(1, Math.ceil(categories.length / maxCategoryAxisLabels)) - 1
  const capBarWidth = categories.length > barMaxWidthCategoryThreshold
  const splitLineColor = colors.isDark ? colors.mutedForeground : colors.border
  const splitLineOpacity = colors.isDark ? 0.3 : 0.6
  const gridBottom = showXAxisLabels ? gridVerticalInsetPx : 4
  const gridTop = showXAxisLabels ? gridVerticalInsetPx : 4

  const option: EChartsCoreOption = {
    backgroundColor: "transparent",
    grid: {
      left: showYAxis ? 48 : 4,
      right: showXAxisLabels ? 16 : 4,
      top: gridTop,
      bottom: gridBottom,
      containLabel: false,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
        // Default shadow is often too opaque and paints over bars; keep a light band only.
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
        const first = list[0] as { name?: string; value?: number; dataIndex?: number } | undefined
        const name = first?.name ?? ""
        const dataIndex = typeof first?.dataIndex === "number" ? first.dataIndex : 0
        const tooltipCategory = tooltipCategories[dataIndex] ?? name
        const value = typeof first?.value === "number" ? first.value : Number(first?.value ?? 0)
        return formatTooltip ? formatTooltip(tooltipCategory, value) : `${tooltipCategory}<br/><b>${value}</b>`
      },
    },
    xAxis: {
      type: "category",
      data: [...categories],
      axisLine: showXAxisLabels ? { lineStyle: { color: colors.border } } : { show: false },
      axisLabel: showXAxisLabels
        ? {
            color: colors.mutedForeground,
            fontSize: xAxisLabelFontSize,
            rotate: 0,
            interval: categoryLabelInterval,
            hideOverlap: true,
          }
        : { show: false },
      axisTick: showXAxisLabels ? { alignWithLabel: true, lineStyle: { color: colors.border } } : { show: false },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: showXAxisLabels
        ? { lineStyle: { color: splitLineColor, type: "dashed", opacity: splitLineOpacity } }
        : { show: false },
      axisLine: { show: false },
      ...(showYAxis ? {} : { axisTick: { show: false } }),
      axisLabel: showYAxis ? { color: colors.mutedForeground, fontSize: 11 } : { show: false },
    },
    series: [
      {
        type: "bar",
        data: values.map((v, i) => {
          const c = itemColors?.[i]
          if (!c) return v
          return {
            value: v,
            itemStyle: { color: c, borderRadius: [4, 4, 0, 0] },
            emphasis: {
              itemStyle: { color: c, borderRadius: [4, 4, 0, 0] },
            },
          }
        }),
        ...(capBarWidth ? { barMaxWidth: barMaxWidthPx } : {}),
        barCategoryGap: "18%",
        cursor: "default",
        itemStyle: {
          color: colors.primary,
          borderRadius: [4, 4, 0, 0],
        },
        emphasis: {
          itemStyle: {
            color: colors.primary,
            borderRadius: [4, 4, 0, 0],
          },
        },
      },
    ],
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
