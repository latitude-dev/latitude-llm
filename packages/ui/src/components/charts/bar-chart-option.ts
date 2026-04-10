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
): EChartsCoreOption {
  const categoryLabelInterval =
    categories.length <= maxCategoryAxisLabels
      ? 0
      : Math.max(1, Math.ceil(categories.length / maxCategoryAxisLabels)) - 1
  const capBarWidth = categories.length > barMaxWidthCategoryThreshold
  return {
    backgroundColor: "transparent",
    grid: {
      left: showYAxis ? 48 : 8,
      right: 16,
      top: gridVerticalInsetPx,
      bottom: gridVerticalInsetPx,
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
      splitLine: { lineStyle: { color: colors.border, type: "dashed", opacity: 0.6 } },
      axisLine: { show: false },
      ...(showYAxis ? {} : { axisTick: { show: false } }),
      axisLabel: showYAxis ? { color: colors.mutedForeground, fontSize: 11 } : { show: false },
    },
    series: [
      {
        type: "bar",
        data: [...values],
        ...(capBarWidth ? { barMaxWidth: barMaxWidthPx } : {}),
        barCategoryGap: "18%",
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
}
