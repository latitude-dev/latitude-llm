import { useSyncExternalStore } from "react"

import { type ChartCssThemeColors, chartThemeFallback, readChartThemeFromCssStable } from "./chart-css-theme.ts"

function subscribeToRootClass(onChange: () => void): () => void {
  if (typeof document === "undefined") {
    return () => {}
  }
  const el = document.documentElement
  const observer = new MutationObserver(onChange)
  observer.observe(el, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

/**
 * Theme colors aligned with `globals.css` variables; updates when `html` class (e.g. `.dark`) changes.
 */
export function useChartCssTheme(): ChartCssThemeColors {
  return useSyncExternalStore(
    subscribeToRootClass,
    () => readChartThemeFromCssStable(),
    () => chartThemeFallback(false),
  )
}
