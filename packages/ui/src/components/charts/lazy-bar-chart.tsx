import { type ComponentProps, Suspense, lazy } from "react"

import { ChartSkeleton } from "./chart-skeleton.tsx"

const BarChartLazy = lazy(() => import("./bar-chart.tsx").then((m) => ({ default: m.BarChart })))

/**
 * Lazy-loaded BarChart that defers the echarts bundle (~500kB) until
 * the component is actually rendered. Shows a skeleton placeholder
 * while loading.
 */
export function LazyBarChart(props: ComponentProps<typeof BarChartLazy>) {
  return (
    <Suspense fallback={<ChartSkeleton minHeight={props.height ?? 200} className="border-0 bg-transparent p-0" />}>
      <BarChartLazy {...props} />
    </Suspense>
  )
}
