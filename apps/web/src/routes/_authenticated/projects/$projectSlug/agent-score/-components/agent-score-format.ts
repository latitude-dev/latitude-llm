export const SCORE_DIMENSION_ORDER = ["outcome", "reliability", "cost", "speed", "safety"] as const
export type ScoreDimensionKey = (typeof SCORE_DIMENSION_ORDER)[number]

export const formatScore = (value: number): string => value.toFixed(0)

export const formatCount = (value: number): string => value.toLocaleString()

export const formatPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`

export const formatDate = (date: string): string =>
  new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
