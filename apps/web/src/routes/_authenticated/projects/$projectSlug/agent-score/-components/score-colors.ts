import { scoreBandOf } from "@domain/shared"

const SCORE_COLORS = {
  unavailable: { className: "text-muted-foreground", color: "#6b7280" },
  low: { className: "text-[#de5f47]", color: "#de5f47" },
  medium: { className: "text-[oklch(85.2%_0.199_91.936)]", color: "oklch(85.2% 0.199 91.936)" },
  high: { className: "text-[#75c970]", color: "#75c970" },
} as const

const BAND_KEY = { unknown: "unavailable", low: "low", medium: "medium", high: "high" } as const

export const scoreColors = (score: number | null) => SCORE_COLORS[BAND_KEY[scoreBandOf(score)]]
