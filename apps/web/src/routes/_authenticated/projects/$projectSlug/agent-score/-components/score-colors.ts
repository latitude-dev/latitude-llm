const SCORE_COLORS = {
  unavailable: { className: "text-muted-foreground", color: "#6b7280" },
  low: { className: "text-[#de5f47]", color: "#de5f47" },
  medium: { className: "text-[oklch(85.2%_0.199_91.936)]", color: "oklch(85.2% 0.199 91.936)" },
  high: { className: "text-[#75c970]", color: "#75c970" },
} as const

export const scoreColors = (score: number | null) => {
  if (score === null) return SCORE_COLORS.unavailable
  if (score < 60) return SCORE_COLORS.low
  if (score < 80) return SCORE_COLORS.medium
  return SCORE_COLORS.high
}
