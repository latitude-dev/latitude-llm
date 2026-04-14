/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"

import type { ChartCssThemeColors } from "./chart-css-theme.ts"

const maxCategoryAxisLabels = 6

/** Above this many categories, cap bar thickness so dense histograms stay readable. */
const barMaxWidthCategoryThreshold = 16
const barMaxWidthPx = 40

export function buildBarChartOption(
  categories: readonly string[],
  values: readonly number[],
  colors: ChartCssThemeColors,
  formatTooltip?: (category: string, value: number) => string,
  showYAxis = true,
  enableBrush = false,
): EChartsCoreOption {
  const categoryLabelInterval =
    categories.length <= maxCategoryAxisLabels
      ? 0
      : Math.max(1, Math.ceil(categories.length / maxCategoryAxisLabels)) - 1
  const capBarWidth = categories.length > barMaxWidthCategoryThreshold
  const option: EChartsCoreOption = {
    backgroundColor: "transparent",
    grid: {
      left: showYAxis ? 48 : 8,
      right: 16,
      top: 16,
      bottom: 36,
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
        const first = list[0] as { name?: string; value?: number } | undefined
        const name = first?.name ?? ""
        const value = typeof first?.value === "number" ? first.value : Number(first?.value ?? 0)
        return formatTooltip ? formatTooltip(name, value) : `${name}<br/><b>${value}</b>`
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
    // `brush.toolbox: []` does not hide ECharts’ brush toolbox (see apache/echarts#20163).
    // Hide only the brush toolbox buttons; brush + `takeGlobalCursor` in `BarChart` keep working.
    option.toolbox = {
      feature: {
        brush: { show: false },
      },
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
