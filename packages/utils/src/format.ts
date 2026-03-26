const COUNT_UNITS = ["", "K", "M", "B", "T"]

/**
 * Format a large number into a compact human-readable string.
 *
 * Examples: `128000` -> `"128K"`, `1500000` -> `"1.5M"`, `42` -> `"42"`
 */
export function formatCount(count: number): string {
  if (count < 0) return `-${formatCount(-count)}`
  if (count < 1000) return String(count)

  let unitIndex = 0
  let value = count
  while (value >= 1000 && unitIndex < COUNT_UNITS.length - 1) {
    value /= 1000
    unitIndex++
  }

  const decimal = value < 10 ? 1 : 0
  return `${value.toFixed(decimal).replace(/\.0$/, "")}${COUNT_UNITS[unitIndex]}`
}

/**
 * Format a dollar amount for display.
 *
 * Examples: `0` -> `"$0"`, `2.5` -> `"$2.50"`, `0.003` -> `"$0.003"`
 */
export function formatPrice(price: number): string {
  if (price === 0) return "$0"
  if (price < 0.01) return `$${price.toFixed(3)}`
  return `$${price.toFixed(2)}`
}

/**
 * Format a nanosecond duration into a human-readable string.
 *
 * Examples: `500_000` -> `"500.0µs"`, `12_300_000` -> `"12.3ms"`, `1_500_000_000` -> `"1.50s"`
 */
export function formatDuration(ns: number): string {
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`
  return `${(ns / 1_000_000_000).toFixed(2)}s`
}

export function safeParseJson(
  value: string,
  { fallback = "object" }: { fallback?: "object" | "string" } = {},
): string | Record<string, unknown> {
  if (value === "") return fallback === "string" ? "" : {}

  try {
    return (JSON.parse(value || "{}") ?? {}) as Record<string, unknown>
  } catch {
    return fallback === "string" ? value : {}
  }
}

/**
 * Parse a ClickHouse timestamp string (e.g. `"2026-03-25 10:00:00.000"`) as UTC.
 *
 * ClickHouse `DateTime`/`DateTime64` columns return strings without a timezone
 * marker, so `new Date(str)` would parse them as local time. Appending " UTC"
 * forces correct interpretation.
 */
export function parseCHDate(value: string): Date {
  return new Date(`${value} UTC`)
}

export function safeStringifyJson(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value) ?? fallback
  } catch {
    return String(value)
  }
}
