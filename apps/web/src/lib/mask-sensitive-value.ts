export function maskSensitiveValue(value: string) {
  return value.length > 7 ? `${value.slice(0, 3)}********${value.slice(-4)}` : "********"
}
