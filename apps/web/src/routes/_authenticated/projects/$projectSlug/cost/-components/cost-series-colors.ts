/**
 * Series colours for the cost panels, ordered so the biggest spender gets the
 * strongest hue. Both model panels rank by window spend, so the same model keeps
 * the same colour across them.
 *
 * Values are literal `oklch()` Tailwind shades rather than `var(--color-*)`: the
 * line/area/pie series render through echarts' canvas renderer, and canvas
 * fillStyle/strokeStyle can't resolve CSS custom properties — a var() reference
 * here silently falls back to grey. Dark mode steps one shade darker (-600 vs
 * -400) since the light-mode ramp reads as too bright against a dark background.
 */
const MODEL_COLORS_LIGHT: readonly string[] = [
  "oklch(70.7% 0.165 254.624)", // blue-400
  "oklch(70.2% 0.183 293.541)", // violet-400
  "oklch(74% 0.238 322.16)", // fuchsia-400
  "oklch(77.7% 0.152 181.912)", // teal-400
  "oklch(82.8% 0.189 84.429)", // amber-400
  "oklch(70.4% 0.191 22.216)", // red-400
  "oklch(74.6% 0.16 232.661)", // sky-400
  "oklch(84.1% 0.238 128.85)", // lime-400
]

const MODEL_COLORS_DARK: readonly string[] = [
  "oklch(54.6% 0.245 262.881)", // blue-600
  "oklch(54.1% 0.281 293.009)", // violet-600
  "oklch(59.1% 0.293 322.896)", // fuchsia-600
  "oklch(60% 0.118 184.704)", // teal-600
  "oklch(66.6% 0.179 58.318)", // amber-600
  "oklch(57.7% 0.245 27.325)", // red-600
  "oklch(58.8% 0.158 241.966)", // sky-600
  "oklch(64.8% 0.2 131.684)", // lime-600
]

const TREND_LIGHT = "oklch(70.7% 0.165 254.624)" // blue-400, same as MODEL_COLORS_LIGHT[0]
const TREND_DARK = "oklch(54.6% 0.245 262.881)" // blue-600, same as MODEL_COLORS_DARK[0]

export const modelColorAt = (index: number, isDark: boolean): string => {
  const ramp = isDark ? MODEL_COLORS_DARK : MODEL_COLORS_LIGHT
  return ramp[index % ramp.length] ?? trendColor(isDark)
}

export const trendColor = (isDark: boolean): string => (isDark ? TREND_DARK : TREND_LIGHT)

/**
 * The impact panel encodes measure, not model, so its usage bar takes a fixed hue
 * held outside the ramp above — reusing a ramp slot would let a model's calls bar
 * match that same model's line in the panel beside it. Spend reuses `trendColor`.
 */
export const callsSeriesColor = (isDark: boolean): string =>
  isDark ? "oklch(62.7% 0.194 149.214)" : "oklch(79.2% 0.209 151.711)" // green-600 / green-400

/** Reserved for the collapsed remainder, so it never reads as a model of its own. */
export const otherSeriesColor = (isDark: boolean): string =>
  isDark ? "oklch(44.6% 0.03 256.802)" : "oklch(70.7% 0.022 261.325)" // gray-600 / gray-400
