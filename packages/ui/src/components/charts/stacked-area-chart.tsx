/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"
import EChartsReact from "echarts-for-react/lib/core"
import type { ComponentType, CSSProperties, HTMLAttributes } from "react"
import { useMemo, useState } from "react"

import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { chartThemeFallback } from "./chart-css-theme.ts"
import { echarts } from "./register-echarts.ts"
import { buildStackedAreaChartOption, type StackedAreaSeriesSpec } from "./stacked-area-chart-option.ts"
import { useChartCssTheme } from "./use-chart-css-theme.ts"

export type { StackedAreaSeriesSpec } from "./stacked-area-chart-option.ts"

export type StackedAreaChartProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** Shared X-axis labels; one entry per data point. */
  readonly categories: readonly string[]
  /** Stacked layers, bottom-first. Each `values` must match `categories.length`. */
  readonly series: readonly StackedAreaSeriesSpec[]
  /** Pixel height of the chart area (default 200). */
  readonly height?: number
  readonly ariaLabel?: string
  readonly colorScheme?: "light" | "dark"
  /** Optional tooltip title formatter; receives the bucket category + index. */
  readonly tooltipTitle?: (category: string, dataIndex: number) => string
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
 * A multi-layer stacked area chart for showing a composition over a
 * time axis. Designed for small dashboard tiles — no brush, no click,
 * no axis customisation beyond what the theme dictates.
 *
 * The chart renders nothing on the server (echarts requires the DOM)
 * and shows a fixed-height placeholder until mount.
 */
export function StackedAreaChart({
  categories,
  series,
  height = 200,
  ariaLabel = "Stacked area chart",
  colorScheme,
  tooltipTitle,
  className,
  ...rest
}: StackedAreaChartProps) {
  const [mounted, setMounted] = useState(false)
  useMountEffect(() => {
    setMounted(true)
  })

  const cssTheme = useChartCssTheme()
  const colors = colorScheme ? chartThemeFallback(colorScheme === "dark") : cssTheme

  const option = useMemo(
    () => buildStackedAreaChartOption(categories, series, colors, tooltipTitle ? { tooltipTitle } : {}),
    [categories, series, colors, tooltipTitle],
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
