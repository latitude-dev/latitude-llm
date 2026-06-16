/// <reference path="../../echarts-subpaths.d.ts" />
import type { ECharts, EChartsCoreOption } from "echarts/core"
import EChartsReact from "echarts-for-react/lib/core"
import type { ComponentType, CSSProperties, HTMLAttributes } from "react"
import { useCallback, useMemo, useRef, useState } from "react"

import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { chartThemeFallback } from "./chart-css-theme.ts"
import { buildChartOption, type ChartAxisDescriptor, type ChartSeries } from "./chart-option.ts"
import { echarts } from "./register-echarts.ts"
import { useChartCssTheme } from "./use-chart-css-theme.ts"

export type { ChartAxisDescriptor, ChartBarSeries, ChartLineSeries, ChartSeries } from "./chart-option.ts"

export type ChartProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onSelect"> & {
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
  /**
   * Called when the user selects a range via brush (drag on the chart).
   * Receives the selected category range [startIndex, endIndex] or null when cleared.
   */
  readonly onSelect?: ((range: { startIndex: number; endIndex: number } | null) => void) | undefined
}

type EChartsEventHandler = (params: unknown) => void

type EChartsReactBridgeProps = {
  readonly echarts: typeof echarts
  readonly option: EChartsCoreOption
  readonly style?: CSSProperties
  readonly opts?: { readonly renderer?: "canvas" | "svg" }
  readonly notMerge?: boolean
  readonly lazyUpdate?: boolean
  readonly onEvents?: Record<string, EChartsEventHandler> | undefined
  readonly onChartReady?: ((instance: ECharts) => void) | undefined
}

const EChartsView = ((EChartsReact as unknown as { default?: unknown }).default ??
  EChartsReact) as unknown as ComponentType<EChartsReactBridgeProps>

/**
 * Generic time-series chart that takes any combination of bar / line /
 * area series at shared X categories. One primitive for every layout
 * the dashboard needs — pick a series mix, pick axes, render. Pass
 * `onSelect` to enable drag-to-select (brush) over the X axis.
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
  onSelect,
  className,
  ...rest
}: ChartProps) {
  const [mounted, setMounted] = useState(false)
  const chartRef = useRef<ECharts | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const hasBrush = !!onSelect

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
        enableBrush: hasBrush,
      }),
    [categories, series, colors, primaryAxis, secondaryAxis, tooltipTitle, xAxisLabelFontSize, hasBrush],
  )

  // Stable handlers reading the latest onSelect from a ref so echarts-for-react
  // doesn't rebind events every render; the brush cursor must be re-armed after
  // each `notMerge` option swap (echarts resets interaction mode), and `finished`
  // is the only post-render hook that fires reliably for that.
  const reapplyBrushCursor = useCallback(() => {
    chartRef.current?.dispatchAction({
      type: "takeGlobalCursor",
      key: "brush",
      brushOption: { brushType: "lineX", brushMode: "single" },
    })
  }, [])

  const onEvents = useMemo(() => {
    if (!hasBrush) return undefined
    return {
      brushEnd: (params: unknown) => {
        const p = params as { areas?: Array<{ coordRange?: [number, number] }> } | undefined
        const coordRange = p?.areas?.[0]?.coordRange
        if (!coordRange) return
        const [startIndex, endIndex] = coordRange
        onSelectRef.current?.({ startIndex, endIndex })
      },
      click: () => {
        chartRef.current?.dispatchAction({ type: "brush", areas: [] })
        onSelectRef.current?.(null)
      },
      finished: () => {
        reapplyBrushCursor()
      },
    }
  }, [hasBrush, reapplyBrushCursor])

  const onChartReady = useMemo(() => {
    if (!hasBrush) return undefined
    return (instance: ECharts) => {
      chartRef.current = instance
      reapplyBrushCursor()
    }
  }, [hasBrush, reapplyBrushCursor])

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
        onEvents={onEvents}
        onChartReady={onChartReady}
      />
    </div>
  )
}
