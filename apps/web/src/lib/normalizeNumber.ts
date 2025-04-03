export function normalizeNumber(score: number, lower: number, upper: number) {
  if (lower === upper) return score === lower ? 1 : 0
  else if (lower < upper) score = Math.min(Math.max(score, lower), upper)
  else score = Math.min(Math.max(score, upper), lower)
  const range = Math.abs(upper - lower)
  const value = Math.abs(score - lower)
  const map = (value * 1) / range
  return Math.min(Math.max(map, 0), 1)
}
