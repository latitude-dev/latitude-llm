const COUNT_UNITS = ["", "K", "M", "B", "T"]

const countFractionFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  useGrouping: false,
})

/**
 * Format a large number into a compact human-readable string.
 *
 * Examples: `128000` -> `"128K"`, `1500000` -> `"1.5M"`, `42` -> `"42"`
 * Fractional values under 1000 use at most two decimal places (e.g. averages).
 */
export function formatCount(count: number): string {
  if (count < 0) return `-${formatCount(-count)}`
  if (count < 1000) {
    if (Number.isInteger(count)) return String(count)
    return countFractionFormatter.format(count)
  }

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
 * Examples: `0` -> `"$0"`, `2.5` -> `"$2.50"`, `0.003` -> `"$0.003"`, `0.0000075` -> `"$0.0000075"`
 *
 * Uses enough decimal places to always show a non-zero digit for positive values.
 */
export function formatPrice(price: number): string {
  if (price === 0) return "$0"
  if (price >= 0.01) return `$${price.toFixed(2)}`
  // Find the first non-zero decimal digit and show one more
  const digits = Math.max(3, -Math.floor(Math.log10(price)) + 1)
  const s = price.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "")
  return `$${s}`
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"]

/**
 * Format a byte count into a human-readable string (base 1024).
 *
 * Examples: `0` -> `"0 B"`, `1536` -> `"1.5 KB"`, `2_400_000` -> `"2.3 MB"`
 * Whole bytes show no decimals; KB and above show one decimal place.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 0) return `-${formatBytes(-bytes)}`
  if (bytes < 1024) return `${Math.round(bytes)} B`

  let unitIndex = 0
  let value = bytes
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex++
  }

  return `${value.toFixed(1).replace(/\.0$/, "")} ${BYTE_UNITS[unitIndex]}`
}

const NS_PER_MICROSECOND = 1_000
const NS_PER_MILLISECOND = 1_000_000
const NS_PER_SECOND = 1_000_000_000
const NS_PER_MINUTE = 60 * NS_PER_SECOND
const NS_PER_HOUR = 60 * NS_PER_MINUTE
const NS_PER_DAY = 24 * NS_PER_HOUR
const NS_PER_YEAR = 365 * NS_PER_DAY

/**
 * Format a nanosecond duration. Below a minute, one unit with fractional precision
 * (`1_500_000_000` -> `"1.50s"`); from a minute up, the two most-significant non-zero
 * whole units (`90e9` -> `"1m 30s"`).
 */
export function formatDuration(ns: number): string {
  if (ns < NS_PER_MILLISECOND) return `${(ns / NS_PER_MICROSECOND).toFixed(1)}µs`
  if (ns < NS_PER_SECOND) return `${(ns / NS_PER_MILLISECOND).toFixed(1)}ms`
  if (ns < NS_PER_MINUTE) return `${(ns / NS_PER_SECOND).toFixed(2)}s`
  const years = Math.floor(ns / NS_PER_YEAR)
  const days = Math.floor((ns % NS_PER_YEAR) / NS_PER_DAY)
  const hours = Math.floor((ns % NS_PER_DAY) / NS_PER_HOUR)
  const minutes = Math.floor((ns % NS_PER_HOUR) / NS_PER_MINUTE)
  const seconds = Math.floor((ns % NS_PER_MINUTE) / NS_PER_SECOND)
  const parts = [
    years > 0 ? `${years}y` : null,
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    seconds > 0 ? `${seconds}s` : null,
  ].filter((part): part is string => part !== null)
  return parts.slice(0, 2).join(" ")
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

const CH_TIMESTAMP_HAS_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2}| UTC)$/

const normalizeCHDateValue = (value: string): string => {
  if (CH_TIMESTAMP_HAS_TIMEZONE.test(value)) {
    return value
  }

  return value.includes("T") ? `${value}Z` : `${value} UTC`
}

/**
 * Parse a ClickHouse timestamp string (e.g. `"2026-03-25 10:00:00.000"`) as UTC.
 *
 * ClickHouse `DateTime`/`DateTime64` columns return strings without a timezone
 * marker, so `new Date(str)` would parse them as local time. This helper
 * normalizes those values to UTC first, while also accepting already-normalized
 * ISO timestamps. Invalid values return `fallback` when provided.
 */
export function parseCHDate(value: string, { fallback }: { readonly fallback?: Date } = {}): Date {
  const parsed = new Date(normalizeCHDateValue(value))
  return Number.isNaN(parsed.getTime()) ? (fallback ?? parsed) : parsed
}

const ZWSP_AND_BOM = /[\u200B-\u200D\uFEFF]/g

/**
 * Normalizes scalar strings read from CH (ClickHouse) JSON responses.
 *
 * `FixedString` columns are often NUL-padded to their width; the client returns those bytes in the
 * string. Optional id columns also use empty `FixedString` / defaulted strings the same way.
 * Strip NULs, zero-width/BOM characters, then trim so `"absent"` consistently maps to `""`.
 */
export function normalizeCHString(value: string | null | undefined): string {
  if (value == null) return ""
  return value.replace(/\0/g, "").replace(ZWSP_AND_BOM, "").trim()
}

/** True when {@link normalizeCHString} yields an empty string. */
export function isBlankCHString(value: string | null | undefined): boolean {
  return normalizeCHString(value) === ""
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
