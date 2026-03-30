export type ChartCssThemeColors = {
  readonly foreground: string
  readonly mutedForeground: string
  readonly border: string
  /** Brand primary from `--primary` (same token as buttons / links). */
  readonly primary: string
  readonly tooltipBackground: string
  readonly tooltipBorder: string
}

const FALLBACK_LIGHT: ChartCssThemeColors = {
  foreground: "hsl(224 71.5% 4%)",
  mutedForeground: "hsl(211 11% 45%)",
  border: "hsl(0 0% 89.8%)",
  primary: "hsl(210 100% 50%)",
  tooltipBackground: "hsl(0 0% 100%)",
  tooltipBorder: "hsl(0 0% 89.8%)",
}

const FALLBACK_DARK: ChartCssThemeColors = {
  foreground: "hsl(0 0% 98%)",
  mutedForeground: "hsl(0 0% 63.9%)",
  border: "hsl(231 9% 12.9%)",
  primary: "hsl(211 94% 43%)",
  tooltipBackground: "hsl(0 0% 3.9%)",
  tooltipBorder: "hsl(231 9% 12.9%)",
}

function hslVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = style.getPropertyValue(name).trim()
  return raw ? `hsl(${raw})` : fallback
}

/**
 * Reads design-token CSS variables from the document root (supports `.dark` on `html`).
 */
export function readChartThemeFromCss(): ChartCssThemeColors {
  if (typeof document === "undefined") {
    return FALLBACK_LIGHT
  }
  const root = document.documentElement
  const isDark = root.classList.contains("dark")
  const fb = isDark ? FALLBACK_DARK : FALLBACK_LIGHT
  const style = getComputedStyle(root)
  return {
    foreground: hslVar(style, "--foreground", fb.foreground),
    mutedForeground: hslVar(style, "--muted-foreground", fb.mutedForeground),
    border: hslVar(style, "--border", fb.border),
    primary: hslVar(style, "--primary", fb.primary),
    tooltipBackground: hslVar(style, "--popover", fb.tooltipBackground),
    tooltipBorder: hslVar(style, "--border", fb.tooltipBorder),
  }
}

function chartThemeFingerprint(colors: ChartCssThemeColors): string {
  return `${colors.foreground}\0${colors.mutedForeground}\0${colors.border}\0${colors.primary}\0${colors.tooltipBackground}\0${colors.tooltipBorder}`
}

let stableThemeCache: ChartCssThemeColors | undefined
let stableThemeFingerprint: string | undefined

/**
 * Same values as {@link readChartThemeFromCss}, but reuses the prior object reference when
 * nothing changed. `useSyncExternalStore` requires this — a fresh object every render causes an
 * infinite update loop.
 */
export function readChartThemeFromCssStable(): ChartCssThemeColors {
  const next = readChartThemeFromCss()
  const fp = chartThemeFingerprint(next)
  if (stableThemeFingerprint === fp && stableThemeCache !== undefined) {
    return stableThemeCache
  }
  stableThemeFingerprint = fp
  stableThemeCache = next
  return next
}

export function chartThemeFallback(isDark: boolean): ChartCssThemeColors {
  return isDark ? FALLBACK_DARK : FALLBACK_LIGHT
}
