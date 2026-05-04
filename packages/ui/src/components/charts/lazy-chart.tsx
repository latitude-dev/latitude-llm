import { type ComponentProps, lazy, Suspense } from "react"

import { HistogramSkeleton } from "./histogram-skeleton.tsx"

const ChartLazy = lazy(() => import("./chart.tsx").then((m) => ({ default: m.Chart })))

/**
 * Lazy-loaded {@link Chart} that defers the echarts bundle until the
 * component is actually rendered. Shows a skeleton placeholder while
 * loading.
 */
export function LazyChart(props: ComponentProps<typeof ChartLazy>) {
  return (
    <Suspense fallback={<HistogramSkeleton height={props.height ?? 200} />}>
      <ChartLazy {...props} />
    </Suspense>
  )
}
