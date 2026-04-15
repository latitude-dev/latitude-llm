/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"

import type { ChartCssThemeColors } from "./chart-css-theme.ts"

export type PieChartDataPoint = {
  readonly name: string
  readonly value: number
}

export function buildPieChartOption(
  data: readonly PieChartDataPoint[],
  segmentColors: readonly string[],
  colors: ChartCssThemeColors,
  formatTooltip?: (name: string, value: number, percent: number) => string,
): EChartsCoreOption {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const seriesData = data.map((d, index) => ({
    name: d.name,
    value: d.value,
    itemStyle: {
      color: segmentColors[index % segmentColors.length] ?? colors.primary,
    },
  }))

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: colors.tooltipBackground,
      borderColor: colors.tooltipBorder,
      textStyle: { color: colors.foreground, fontSize: 12 },
      formatter: (params: unknown) => {
        const p = params as { name?: string; value?: number; percent?: number } | undefined
        const name = p?.name ?? ""
        const value = typeof p?.value === "number" ? p.value : Number(p?.value ?? 0)
        const percent = typeof p?.percent === "number" ? p.percent : total > 0 ? (value / total) * 100 : 0
        return formatTooltip
          ? formatTooltip(name, value, percent)
          : `${name}<br/><b>${value}</b> (${percent.toFixed(1)}%)`
      },
    },
    legend: {
      orient: "vertical",
      right: 8,
      top: "middle",
      textStyle: { color: colors.mutedForeground, fontSize: 11 },
      itemWidth: 8,
      itemHeight: 8,
    },
    series: [
      {
        type: "pie",
        radius: ["42%", "68%"],
        center: ["38%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: colors.tooltipBackground,
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: { show: true, color: colors.foreground, fontSize: 12 },
        },
        data: seriesData,
      },
    ],
  }
}
