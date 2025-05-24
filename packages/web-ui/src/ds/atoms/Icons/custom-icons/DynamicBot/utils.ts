export function calculateUnitVector({
  x,
  y,
  magnitude,
}: {
  x: number
  y: number
  magnitude: number
}): {
  x: number
  y: number
} {
  if (magnitude === 0) return { x: 0, y: 0 }
  return { x: x / magnitude, y: y / magnitude }
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
