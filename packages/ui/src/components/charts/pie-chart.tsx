/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"
import EChartsReact from "echarts-for-react/lib/core"
import type { ComponentType, CSSProperties, HTMLAttributes } from "react"
import { useMemo, useState } from "react"

import { useMountEffect } from "../../hooks/use-mount-effect.ts"
import { cn } from "../../utils/cn.ts"
import { chartThemeFallback } from "./chart-css-theme.ts"
import { buildPieChartOption, type PieChartDataPoint } from "./pie-chart-option.ts"
import { echarts } from "./register-echarts.ts"
import { useChartCssTheme } from "./use-chart-css-theme.ts"

export type { PieChartDataPoint } from "./pie-chart-option.ts"

export type PieChartProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  readonly data: readonly PieChartDataPoint[]
  /** Pixel height of the chart area (default 220). */
  readonly height?: number
  readonly ariaLabel?: string
  readonly colorScheme?: "light" | "dark"
  readonly formatTooltip?: (name: string, value: number, percent: number) => string
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

const FALLBACK_SEGMENT_LIGHT = [
  "hsl(12 76% 61%)",
  "hsl(173 58% 39%)",
  "hsl(197 37% 24%)",
  "hsl(43 74% 66%)",
  "hsl(27 87% 67%)",
]

const FALLBACK_SEGMENT_DARK = [
  "hsl(220 70% 50%)",
  "hsl(160 60% 45%)",
  "hsl(30 80% 55%)",
  "hsl(280 65% 60%)",
  "hsl(340 75% 55%)",
]

function readPieSegmentColors(isDark: boolean): readonly string[] {
  if (typeof document === "undefined") {
    return isDark ? FALLBACK_SEGMENT_DARK : FALLBACK_SEGMENT_LIGHT
  }
  const style = getComputedStyle(document.documentElement)
  const out: string[] = []
  for (let i = 1; i <= 5; i += 1) {
    const raw = style.getPropertyValue(`--chart-${i}`).trim()
    out.push(
      raw ? `hsl(${raw})` : ((isDark ? FALLBACK_SEGMENT_DARK : FALLBACK_SEGMENT_LIGHT)[i - 1] ?? "hsl(211 94% 43%)"),
    )
  }
  return out
}

function PieChart({
  data,
  height = 220,
  ariaLabel = "Pie chart",
  colorScheme,
  formatTooltip,
  className,
  ...rest
}: PieChartProps) {
  const [mounted, setMounted] = useState(false)

  useMountEffect(() => {
    setMounted(true)
  })

  const cssTheme = useChartCssTheme()
  const colors = colorScheme ? chartThemeFallback(colorScheme === "dark") : cssTheme
  const segmentColors = useMemo(() => readPieSegmentColors(colors.isDark), [colors.isDark])

  const option = useMemo(
    () => buildPieChartOption(data, segmentColors, colors, formatTooltip),
    [data, segmentColors, colors, formatTooltip],
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

export { PieChart }
