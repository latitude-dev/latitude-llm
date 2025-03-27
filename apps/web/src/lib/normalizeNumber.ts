export function normalizeNumber(score: number, lower: number, upper: number) {
  const range = Math.abs(upper - lower)
  const value = Math.abs(score - lower)
  const map = (value * 1) / range
  return Math.min(Math.max(map, 0), 1)
}
