import { type ComponentProps, lazy, Suspense } from "react"

import { HistogramSkeleton } from "./histogram-skeleton.tsx"

const BarChartLazy = lazy(() => import("./bar-chart.tsx").then((m) => ({ default: m.BarChart })))

/**
 * Lazy-loaded BarChart that defers the echarts bundle (~500kB) until
 * the component is actually rendered. Shows a skeleton placeholder
 * while loading.
 */
export function LazyBarChart(props: ComponentProps<typeof BarChartLazy>) {
  return (
    <Suspense fallback={<HistogramSkeleton height={props.height ?? 200} />}>
      <BarChartLazy {...props} />
    </Suspense>
  )
}
