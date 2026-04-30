/// <reference path="../../echarts-subpaths.d.ts" />
import type { ECharts, EChartsCoreOption } from "echarts/core"
import EChartsReact from "echarts-for-react/lib/core"
import type { ComponentType, CSSProperties, HTMLAttributes } from "react"
import { useCallback, useMemo, useRef, useState } from "react"

import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { type BarSeriesSpec, buildBarChartOption } from "./bar-chart-option.ts"
import { chartThemeFallback } from "./chart-css-theme.ts"
import { echarts } from "./register-echarts.ts"
import { useChartCssTheme } from "./use-chart-css-theme.ts"

export type BarChartDataPoint = {
  readonly category: string
  readonly tooltipCategory?: string
  readonly value: number
}

/**
 * Optional secondary bar series rendered alongside the primary bars.
 * Aligned 1-1 with `data` by index; if you pass 30 categories, each
 * overlay's `values` should also have 30 entries.
 *
 * Set `axis: 'right'` to plot against a secondary y-axis — useful when
 * the primary and overlay magnitudes live on very different scales.
 *
 * Set `stack` to group overlays vertically: any overlays sharing the
 * same `stack` key stack together at each category, and ECharts
 * groups distinct stacks side-by-side with the primary bars.
 */
export type BarChartBarSeries = BarSeriesSpec

export type BarChartProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "onSelect"> & {
  readonly data: readonly BarChartDataPoint[]
  /** Pixel height of the chart area (default 200). */
  readonly height?: number
  /** Accessible label for the chart container. */
  readonly ariaLabel?: string
  /**
   * When set, uses static fallbacks for that scheme instead of reading CSS variables
   * (useful for embedded previews with a forced theme).
   */
  readonly colorScheme?: "light" | "dark"
  readonly formatTooltip?: (category: string, value: number) => string
  /** When false, hides y-axis tick labels and frees left grid margin (tooltip still shows values). */
  readonly showYAxis?: boolean
  /** Optional x-axis label font size override in pixels. */
  readonly xAxisLabelFontSize?: number
  /**
   * Called when user selects a range via brush (e.g., drag on the histogram).
   * Receives the selected data range [startIndex, endIndex] or null if cleared.
   */
  readonly onSelect?: ((range: { startIndex: number; endIndex: number } | null) => void) | undefined
  /** Optional overlay bar series (stacked, axis-aware). */
  readonly bars?: readonly BarChartBarSeries[]
  /** Series name shown in the legend for the primary bars. Defaults to "Bars" when `bars` is set. */
  readonly primarySeriesName?: string
  /** Display name for the secondary y-axis (only used when at least one overlay targets it). */
  readonly secondaryAxisName?: string
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

/** `echarts-for-react` ships a CJS module; handle ESM interop and cast for React 19 JSX typing. */
const EChartsView = ((EChartsReact as unknown as { default?: unknown }).default ??
  EChartsReact) as unknown as ComponentType<EChartsReactBridgeProps>

function BarChart({
  data,
  height = 200,
  ariaLabel = "Bar chart",
  colorScheme,
  formatTooltip,
  showYAxis = true,
  xAxisLabelFontSize,
  onSelect,
  bars,
  primarySeriesName,
  secondaryAxisName,
  className,
  ...rest
}: BarChartProps) {
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

  const categories = useMemo(() => data.map((d) => d.category), [data])
  const tooltipCategories = useMemo(() => data.map((d) => d.tooltipCategory ?? d.category), [data])
  const values = useMemo(() => data.map((d) => d.value), [data])

  const option = useMemo(
    () =>
      buildBarChartOption(
        categories,
        values,
        tooltipCategories,
        colors,
        formatTooltip,
        showYAxis,
        hasBrush,
        xAxisLabelFontSize,
        {
          ...(bars ? { bars } : {}),
          ...(primarySeriesName ? { primarySeriesName } : {}),
          ...(secondaryAxisName ? { secondaryAxisName } : {}),
        },
      ),
    [
      categories,
      values,
      tooltipCategories,
      colors,
      formatTooltip,
      showYAxis,
      hasBrush,
      xAxisLabelFontSize,
      bars,
      primarySeriesName,
      secondaryAxisName,
    ],
  )

  // Stable event handlers that read the latest onSelect from a ref.
  // This prevents echarts-for-react from rebinding events on every render.
  const reapplyBrushCursor = useCallback(() => {
    chartRef.current?.dispatchAction({
      type: "takeGlobalCursor",
      key: "brush",
      brushOption: {
        brushType: "lineX",
        brushMode: "single",
      },
    })
  }, [])

  const onEvents = useMemo(() => {
    if (!hasBrush) return undefined
    return {
      brushEnd: (params: unknown) => {
        const p = params as { areas?: Array<{ coordRange?: [number, number] }> } | undefined
        const areas = p?.areas
        if (!areas || areas.length === 0) return
        const coordRange = areas[0]?.coordRange
        if (!coordRange) return
        const [startIndex, endIndex] = coordRange
        onSelectRef.current?.({ startIndex, endIndex })
      },
      click: () => {
        if (chartRef.current) {
          chartRef.current.dispatchAction({ type: "brush", areas: [] })
        }
        onSelectRef.current?.(null)
      },
      /**
       * `notMerge` replaces the full option; brush interaction mode is reset and must be
       * re-established. `onChartReady` only runs once, so we reapply after each render cycle.
       */
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

export { BarChart }
