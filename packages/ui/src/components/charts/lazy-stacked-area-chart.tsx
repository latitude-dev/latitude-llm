import { type ComponentProps, lazy, Suspense } from "react"

import { HistogramSkeleton } from "./histogram-skeleton.tsx"

const StackedAreaChartLazy = lazy(() =>
  import("./stacked-area-chart.tsx").then((m) => ({ default: m.StackedAreaChart })),
)

/**
 * Lazy-loaded StackedAreaChart that defers the echarts bundle until
 * the component is actually rendered. Shows a skeleton placeholder
 * while loading.
 */
export function LazyStackedAreaChart(props: ComponentProps<typeof StackedAreaChartLazy>) {
  return (
    <Suspense fallback={<HistogramSkeleton height={props.height ?? 200} />}>
      <StackedAreaChartLazy {...props} />
    </Suspense>
  )
}
