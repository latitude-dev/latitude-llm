import { type ComponentProps, lazy, Suspense } from "react"

import { HistogramSkeleton } from "./histogram-skeleton.tsx"

const PieChartLazy = lazy(() => import("./pie-chart.tsx").then((m) => ({ default: m.PieChart })))

/**
 * Lazy-loaded PieChart that defers the echarts bundle until the component is rendered.
 */
export function LazyPieChart(props: ComponentProps<typeof PieChartLazy>) {
  return (
    <Suspense fallback={<HistogramSkeleton height={props.height ?? 220} />}>
      <PieChartLazy {...props} />
    </Suspense>
  )
}
