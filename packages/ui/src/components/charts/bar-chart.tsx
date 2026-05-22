/// <reference path="../../echarts-subpaths.d.ts" />
import type { ECharts, EChartsCoreOption } from "echarts/core"
import EChartsReact from "echarts-for-react/lib/core"
import type { ComponentType, CSSProperties, HTMLAttributes } from "react"
import { useCallback, useMemo, useRef, useState } from "react"

import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import {
  type BarChartOverlay,
  type BarChartOverlayArea,
  type BarChartOverlayLine,
  buildBarChartOption,
} from "./bar-chart-option.ts"
import { chartThemeFallback } from "./chart-css-theme.ts"
import { echarts } from "./register-echarts.ts"
import { useChartCssTheme } from "./use-chart-css-theme.ts"

export type { BarChartOverlay, BarChartOverlayArea, BarChartOverlayLine }

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
  readonly formatTooltip?: (category: string, value: number, dataIndex: number) => string
  /** When false, hides y-axis tick labels and frees left grid margin (tooltip still shows values). */
  readonly showYAxis?: boolean
  /** Optional x-axis label font size override in pixels. */
  readonly xAxisLabelFontSize?: number
  /** Visual overlays drawn over the bar series — vertical mark lines and shaded ranges. */
  readonly overlay?: BarChartOverlay
  /**
   * Called when user selects a range via brush (e.g., drag on the histogram).
   * Receives the selected data range [startIndex, endIndex] or null if cleared.
   */
  readonly onSelect?: ((range: { startIndex: number; endIndex: number } | null) => void) | undefined
  /**
   * Called when the chart's axis pointer enters/leaves a bucket. `dataIndex` is the bucket's
   * position (or null when the cursor leaves the chart). `anchor` is a viewport-space point at
   * the bottom-center of the bucket, suitable for anchoring a popover under the bar — stable
   * within the bucket so cursor jitter doesn't move the popover around.
   *
   * Use this for bucket-wide hover UI (e.g., a per-bucket popover) instead of trying to hit
   * thin overlay markers directly. Fires once per category transition, including the initial
   * entry and the `currTrigger: 'leave'` event when the cursor leaves the chart.
   */
  readonly onBucketAxisPointerChange?:
    | ((dataIndex: number | null, anchor: { clientX: number; clientY: number } | null) => void)
    | undefined
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

/**
 * Returns the viewport-relative anchor point at the **bottom center** of the chart grid at the
 * given `dataIndex`. Used by `onBucketAxisPointerChange` consumers to position a popover stably
 * under the hovered bucket, instead of having it jitter with the cursor.
 *
 * Returns null if the chart isn't ready (no DOM, no coordinate system yet).
 */
function computeBucketBottomAnchor(
  chart: ECharts | null,
  dataIndex: number,
): { clientX: number; clientY: number } | null {
  if (!chart) return null
  const dom = chart.getDom()
  if (!dom) return null
  // `convertToPixel({ seriesIndex: 0 }, [dataIndex, 0])` maps a value-space coordinate (category
  // position, value=0) into pixel space relative to the chart container — i.e. the bottom of
  // the bar at this category, which is also the bottom of the grid.
  const pixel = chart.convertToPixel({ seriesIndex: 0 }, [dataIndex, 0]) as [number, number] | null
  if (!pixel) return null
  const rect = (dom as HTMLElement).getBoundingClientRect()
  return { clientX: rect.left + pixel[0], clientY: rect.top + pixel[1] }
}

function BarChart({
  data,
  height = 200,
  ariaLabel = "Bar chart",
  colorScheme,
  formatTooltip,
  showYAxis = true,
  xAxisLabelFontSize,
  overlay,
  onSelect,
  onBucketAxisPointerChange,
  className,
  ...rest
}: BarChartProps) {
  const [mounted, setMounted] = useState(false)
  const chartRef = useRef<ECharts | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onBucketAxisPointerChangeRef = useRef(onBucketAxisPointerChange)
  onBucketAxisPointerChangeRef.current = onBucketAxisPointerChange
  const hasBrush = !!onSelect
  const hasBucketAxisPointer = !!onBucketAxisPointerChange

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
        overlay,
      ),
    [categories, values, tooltipCategories, colors, formatTooltip, showYAxis, hasBrush, xAxisLabelFontSize, overlay],
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
    if (!hasBrush && !hasBucketAxisPointer) return undefined
    return {
      ...(hasBrush
        ? {
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
              chartRef.current?.dispatchAction({ type: "brush", areas: [] })
              onSelectRef.current?.(null)
            },
          }
        : {}),
      ...(hasBucketAxisPointer
        ? {
            // Fires once per category transition (including `currTrigger: 'leave'` when the
            // cursor leaves the chart). Bucket-level — no need to hit a thin marker line.
            updateAxisPointer: (params: unknown) => {
              const p = params as
                | { currTrigger?: string; axesInfo?: ReadonlyArray<{ value?: number | string }> }
                | undefined
              if (!p) return
              if (p.currTrigger === "leave") {
                onBucketAxisPointerChangeRef.current?.(null, null)
                return
              }
              const rawValue = p.axesInfo?.[0]?.value
              const dataIndex = typeof rawValue === "number" ? rawValue : Number(rawValue)
              if (!Number.isFinite(dataIndex)) {
                onBucketAxisPointerChangeRef.current?.(null, null)
                return
              }
              const anchor = computeBucketBottomAnchor(chartRef.current, dataIndex)
              onBucketAxisPointerChangeRef.current?.(dataIndex, anchor)
            },
          }
        : {}),
      /**
       * `notMerge` replaces the full option; brush interaction mode is reset and must be
       * re-established. `onChartReady` only runs once, so we reapply after each render cycle.
       */
      ...(hasBrush
        ? {
            finished: () => {
              reapplyBrushCursor()
            },
          }
        : {}),
    }
  }, [hasBrush, hasBucketAxisPointer, reapplyBrushCursor])

  const onChartReady = useMemo(() => {
    if (!hasBrush && !hasBucketAxisPointer) return undefined
    return (instance: ECharts) => {
      chartRef.current = instance
      if (hasBrush) reapplyBrushCursor()
    }
  }, [hasBrush, hasBucketAxisPointer, reapplyBrushCursor])

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
