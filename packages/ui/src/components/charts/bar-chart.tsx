/// <reference path="../../echarts-subpaths.d.ts" />
import type { ECharts, EChartsCoreOption } from "echarts/core"
import EChartsReact from "echarts-for-react/lib/core"
import type { ComponentType, CSSProperties, HTMLAttributes } from "react"
import { useMemo, useRef, useState } from "react"

import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { buildBarChartOption } from "./bar-chart-option.ts"
import { chartThemeFallback } from "./chart-css-theme.ts"
import { echarts } from "./register-echarts.ts"
import { useChartCssTheme } from "./use-chart-css-theme.ts"

export type BarChartDataPoint = {
  readonly category: string
  readonly tooltipCategory?: string
  readonly value: number
}

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
}

type EChartsEventHandler = (params: unknown) => void
type BrushEndParams = {
  readonly areas?: Array<{ readonly coordRange?: readonly [number, number] }>
}

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
      ),
    [categories, values, tooltipCategories, colors, formatTooltip, showYAxis, hasBrush, xAxisLabelFontSize],
  )

  // Stable event handlers that read the latest onSelect from a ref.
  // This prevents echarts-for-react from rebinding events on every render.
  const onEvents = useMemo(() => {
    if (!hasBrush) return undefined
    return {
      brushEnd: (params: unknown) => {
        const areas = (params as BrushEndParams | undefined)?.areas
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
    }
  }, [hasBrush])

  const onChartReady = useMemo(() => {
    if (!hasBrush) return undefined
    return (instance: ECharts) => {
      chartRef.current = instance
      // Activate brush cursor on every chart init/re-init
      instance.dispatchAction({
        type: "takeGlobalCursor",
        key: "brush",
        brushOption: {
          brushType: "lineX",
          brushMode: "single",
        },
      })
    }
  }, [hasBrush])

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
