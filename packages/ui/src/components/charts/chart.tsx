/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"
import EChartsReact from "echarts-for-react/lib/core"
import type { ComponentType, CSSProperties, HTMLAttributes } from "react"
import { useMemo, useState } from "react"

import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { chartThemeFallback } from "./chart-css-theme.ts"
import { buildChartOption, type ChartAxisDescriptor, type ChartSeries } from "./chart-option.ts"
import { echarts } from "./register-echarts.ts"
import { useChartCssTheme } from "./use-chart-css-theme.ts"

export type { ChartAxisDescriptor, ChartBarSeries, ChartLineSeries, ChartSeries } from "./chart-option.ts"

export type ChartProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** Shared X-axis labels — one entry per data point. */
  readonly categories: readonly string[]
  /**
   * Series to render at the same X positions. Mix bar and line freely;
   * each series controls its own axis (`'left' | 'right'`), stack key,
   * and (for line) area fill. The chart auto-detects whether to render
   * a single or dual y-axis based on the series mix.
   */
  readonly series: readonly ChartSeries[]
  /** Pixel height of the chart area (default 200). */
  readonly height?: number
  readonly ariaLabel?: string
  readonly colorScheme?: "light" | "dark"
  readonly primaryAxis?: ChartAxisDescriptor
  readonly secondaryAxis?: ChartAxisDescriptor
  /** Optional tooltip title formatter; receives the bucket category + index. */
  readonly tooltipTitle?: (category: string, dataIndex: number) => string
  readonly xAxisLabelFontSize?: number
}

type EChartsReactBridgeProps = {
  readonly echarts: typeof echarts
  readonly option: EChartsCoreOption
  readonly style?: CSSProperties
  readonly opts?: { readonly renderer?: "canvas" | "svg" }
  readonly notMerge?: boolean
  readonly lazyUpdate?: boolean
}

const EChartsView = ((EChartsReact as unknown as { default?: unknown }).default ??
  EChartsReact) as unknown as ComponentType<EChartsReactBridgeProps>

/**
 * Generic time-series chart that takes any combination of bar / line /
 * area series at shared X categories. One primitive for every layout
 * the dashboard needs — pick a series mix, pick axes, render. No
 * brush; if you need brush selection, reach for `BarChart` instead.
 */
export function Chart({
  categories,
  series,
  height = 200,
  ariaLabel = "Chart",
  colorScheme,
  primaryAxis,
  secondaryAxis,
  tooltipTitle,
  xAxisLabelFontSize,
  className,
  ...rest
}: ChartProps) {
  const [mounted, setMounted] = useState(false)
  useMountEffect(() => {
    setMounted(true)
  })

  const cssTheme = useChartCssTheme()
  const colors = colorScheme ? chartThemeFallback(colorScheme === "dark") : cssTheme

  const option = useMemo(
    () =>
      buildChartOption({
        categories,
        series,
        colors,
        ...(primaryAxis ? { primaryAxis } : {}),
        ...(secondaryAxis ? { secondaryAxis } : {}),
        ...(tooltipTitle ? { tooltipTitle } : {}),
        ...(xAxisLabelFontSize !== undefined ? { xAxisLabelFontSize } : {}),
      }),
    [categories, series, colors, primaryAxis, secondaryAxis, tooltipTitle, xAxisLabelFontSize],
  )

  if (!mounted) {
    return (
      <div
        {...rest}
        role="img"
        className={cn("w-full shrink-0", className)}
        style={{ height, ...rest.style }}
        aria-label={ariaLabel}
        aria-busy
      />
    )
  }

  return (
    <div {...rest} role="img" className={cn("w-full shrink-0", className)} aria-label={ariaLabel}>
      <EChartsView
        echarts={echarts}
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge
        lazyUpdate
      />
    </div>
  )
}
