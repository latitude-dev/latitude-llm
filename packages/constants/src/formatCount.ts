const units = ['', 'K', 'M', 'B', 'T']
const unitSize = 1000

export function formatCount(
  count: number,
  opts: { decimalPlaces?: number } = { decimalPlaces: 1 },
): string {
  if (count < 0) return '-' + formatCount(-count)
  if (count < unitSize)
    return count.toFixed(opts.decimalPlaces).replace(/\.0+$/, '')

  let unitIndex = 0

  while (count >= unitSize && unitIndex < units.length - 1) {
    count /= unitSize
    unitIndex++
  }

  // Adjust for edge case of rounding up (e.g., 999.9K should be 1M)
  if (count >= 999.5 && unitIndex < units.length - 1) {
    count = 1
    unitIndex++
  }

  const decimalPlaces = opts.decimalPlaces
    ? opts.decimalPlaces
    : count < 10
      ? 1
      : 0

  return count.toFixed(decimalPlaces).replace(/\.0$/, '') + units[unitIndex]
}
