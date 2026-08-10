/**
 * Series colours for the cost panels, ordered so the biggest spender gets the
 * strongest hue. Both model panels rank by window spend, so the same model keeps
 * the same colour across them.
 */
const MODEL_COLORS: readonly string[] = [
  "hsl(217 91% 60%)",
  "hsl(262 83% 63%)",
  "hsl(291 64% 55%)",
  "hsl(174 62% 42%)",
  "hsl(35 90% 55%)",
  "hsl(0 70% 55%)",
  "hsl(199 89% 48%)",
  "hsl(84 60% 45%)",
]

export const TREND_COLOR = "hsl(217 91% 60%)"

/**
 * The impact panel encodes measure, not model, so its usage bar takes a fixed hue
 * held outside the ramp above — reusing a ramp slot would let a model's calls bar
 * match that same model's line in the panel beside it. Spend reuses `TREND_COLOR`.
 */
export const CALLS_SERIES_COLOR = "hsl(129 50% 40%)"

/** Reserved for the collapsed remainder, so it never reads as a model of its own. */
export const OTHER_SERIES_COLOR = "hsl(211 11% 55%)"

export const modelColorAt = (index: number): string => MODEL_COLORS[index % MODEL_COLORS.length] ?? TREND_COLOR
