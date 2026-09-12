export const SCORE_DIMENSION_ORDER = ["outcome", "reliability", "cost", "speed", "safety"] as const
export type ScoreDimensionKey = (typeof SCORE_DIMENSION_ORDER)[number]

export const formatScore = (value: number): string => value.toFixed(0)

export const formatCount = (value: number): string => value.toLocaleString()

export const oneSessionSuccessRate = (reliability: number): number => (reliability / 100) ** (1 / 20)

export const formatPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`

export const formatHours = (nanoseconds: number): string => {
  const hours = nanoseconds / 3_600_000_000_000
  return hours >= 10 ? `${hours.toFixed(0)}h` : `${hours.toFixed(1)}h`
}

export const formatDate = (date: string): string =>
  new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
