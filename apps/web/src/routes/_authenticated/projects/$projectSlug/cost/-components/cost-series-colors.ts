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
  "hsl(211 11% 55%)",
]

export const TREND_COLOR = "hsl(217 91% 60%)"

/** Reserved for the collapsed remainder, so it never reads as a model of its own. */
export const OTHER_SERIES_COLOR = "hsl(211 11% 55%)"

export const modelColorAt = (index: number): string => MODEL_COLORS[index % MODEL_COLORS.length] ?? TREND_COLOR
