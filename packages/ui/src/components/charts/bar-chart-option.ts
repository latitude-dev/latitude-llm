/// <reference path="../../echarts-subpaths.d.ts" />
import type { EChartsCoreOption } from "echarts/core"

import type { ChartCssThemeColors } from "./chart-css-theme.ts"

const maxCategoryAxisLabels = 6

/** Above this many categories, cap bar thickness so dense histograms stay readable. */
const barMaxWidthCategoryThreshold = 16
const barMaxWidthPx = 40
const gridVerticalInsetPx = 16

/** Visual marker drawn over the histogram. Categories must match `xAxis.data` strings. */
/**
 * Marker keyed by the bucket's **index** in `xAxis.data` (i.e. its position) rather than its
 * formatted display label — display labels can collide for long ranges or formatters that drop
 * the year, which would silently snap a marker to the wrong bucket.
 */
export interface BarChartOverlayLine {
  readonly categoryIndex: number
  readonly color: string
  readonly dashed?: boolean
  /** Symbol drawn at the top of the line; `undefined` hides the symbol. */
  readonly topSymbol?: { readonly shape: "circle" | "diamond" | "rect" | "triangle"; readonly size: number }
}

/** Inclusive area span between two category positions (indices), same rationale as the line. */
export interface BarChartOverlayArea {
  readonly startCategoryIndex: number
  readonly endCategoryIndex: number
  readonly color: string
  readonly opacity?: number
}

export interface BarChartOverlay {
  readonly lines?: readonly BarChartOverlayLine[]
  readonly areas?: readonly BarChartOverlayArea[]
}

/**
 * Tooltip formatter; `dataIndex` is the bar's category index so callers can enrich
 * the tooltip with per-bucket extras (e.g., a list of incidents that fall in this bucket).
 */
type BarChartFormatTooltip = (category: string, value: number, dataIndex: number) => string

export function buildBarChartOption(
  categories: readonly string[],
  values: readonly number[],
  tooltipCategories: readonly string[],
  colors: ChartCssThemeColors,
  formatTooltip?: BarChartFormatTooltip,
  showYAxis = true,
  enableBrush = false,
  xAxisLabelFontSize = 11,
  overlay?: BarChartOverlay,
): EChartsCoreOption {
  const categoryLabelInterval =
    categories.length <= maxCategoryAxisLabels
      ? 0
      : Math.max(1, Math.ceil(categories.length / maxCategoryAxisLabels)) - 1
  const capBarWidth = categories.length > barMaxWidthCategoryThreshold
  const splitLineColor = colors.isDark ? colors.mutedForeground : colors.border
  const splitLineOpacity = colors.isDark ? 0.3 : 0.6
  const option: EChartsCoreOption = {
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
      // `enterable` lets users move into the tooltip to follow links inside it (e.g., per-incident
      // anchors in overlay-enriched tooltips); harmless for plain bar tooltips.
      enterable: true,
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
        return formatTooltip
          ? formatTooltip(tooltipCategory, value, dataIndex)
          : `${tooltipCategory}<br/><b>${value}</b>`
      },
    },
    xAxis: {
      type: "category",
      data: [...categories],
      axisLine: { lineStyle: { color: colors.border } },
      axisLabel: {
        color: colors.mutedForeground,
        fontSize: xAxisLabelFontSize,
        rotate: 0,
        interval: categoryLabelInterval,
        hideOverlap: true,
      },
      axisTick: { alignWithLabel: true, lineStyle: { color: colors.border } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: splitLineColor, type: "dashed", opacity: splitLineOpacity } },
      axisLine: { show: false },
      ...(showYAxis ? {} : { axisTick: { show: false } }),
      axisLabel: showYAxis ? { color: colors.mutedForeground, fontSize: 11 } : { show: false },
    },
    series: buildSeries({ values, capBarWidth, primary: colors.primary, ...(overlay ? { overlay } : {}) }),
  }

  if (enableBrush) {
    option.toolbox = {
      show: false,
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

interface SeriesEntry {
  readonly type: string
  readonly data?: readonly unknown[]
  readonly silent?: boolean
  readonly z?: number
  readonly markLine?: unknown
  readonly markArea?: unknown
  readonly itemStyle?: unknown
  readonly emphasis?: unknown
  readonly barCategoryGap?: string
  readonly barMaxWidth?: number
  readonly cursor?: string
}

function buildSeries({
  values,
  capBarWidth,
  primary,
  overlay,
}: {
  readonly values: readonly number[]
  readonly capBarWidth: boolean
  readonly primary: string
  readonly overlay?: BarChartOverlay
}): readonly SeriesEntry[] {
  const barSeries: SeriesEntry = {
    type: "bar",
    data: [...values],
    ...(capBarWidth ? { barMaxWidth: barMaxWidthPx } : {}),
    barCategoryGap: "18%",
    cursor: "default",
    itemStyle: {
      color: primary,
      borderRadius: [4, 4, 0, 0],
    },
    emphasis: {
      itemStyle: {
        color: primary,
        borderRadius: [4, 4, 0, 0],
      },
    },
  }

  const lines = overlay?.lines ?? []
  const areas = overlay?.areas ?? []
  if (lines.length === 0 && areas.length === 0) return [barSeries]

  const overlaySeries: SeriesEntry = {
    type: "line",
    // No actual line — the series exists solely to host markLine/markArea so they
    // sit on a layer that doesn't disturb axis-tooltip detection of the bar series.
    data: [],
    silent: true,
    z: 5,
    ...(lines.length > 0
      ? {
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            // Bind by category index — on a `type: "category"` xAxis, eCharts accepts a numeric
            // `xAxis` value as the category position. That avoids the label-collision class of
            // bug where two buckets format to the same display string and an overlay snaps to
            // the wrong one.
            data: lines.map((line) => ({
              xAxis: line.categoryIndex,
              lineStyle: {
                color: line.color,
                type: line.dashed ? "dashed" : "solid",
                width: 2,
                opacity: 0.9,
              },
              ...(line.topSymbol
                ? {
                    symbol: ["none", line.topSymbol.shape],
                    symbolSize: line.topSymbol.size,
                  }
                : {}),
            })),
          },
        }
      : {}),
    ...(areas.length > 0
      ? {
          markArea: {
            silent: true,
            data: areas.map((area) => [
              {
                xAxis: area.startCategoryIndex,
                itemStyle: { color: area.color, opacity: area.opacity ?? 0.18 },
              },
              { xAxis: area.endCategoryIndex },
            ]),
          },
        }
      : {}),
  }

  return [barSeries, overlaySeries]
}
