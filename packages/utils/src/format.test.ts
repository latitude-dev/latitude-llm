import { describe, expect, it } from "vitest"
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatPrice,
  isBlankCHString,
  normalizeCHString,
  parseCHDate,
} from "./format.ts"

describe("formatBytes", () => {
  it("formats whole bytes without decimals", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1023)).toBe("1023 B")
  })

  it("formats KB/MB/GB with one decimal", () => {
    expect(formatBytes(1024)).toBe("1 KB")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(2_400_000)).toBe("2.3 MB")
    expect(formatBytes(1024 ** 3)).toBe("1 GB")
  })

  it("handles negative values", () => {
    expect(formatBytes(-1536)).toBe("-1.5 KB")
  })
})

describe("formatCount", () => {
  it("returns small numbers as-is", () => {
    expect(formatCount(0)).toBe("0")
    expect(formatCount(42)).toBe("42")
    expect(formatCount(999)).toBe("999")
  })

  it("limits fractional small numbers to two decimal places", () => {
    expect(formatCount(74.333333333333)).toBe("74.33")
    expect(formatCount(74.3)).toBe("74.3")
    expect(formatCount(0.12)).toBe("0.12")
    expect(formatCount(1.005)).toBe("1.01")
  })

  it("formats thousands", () => {
    expect(formatCount(1000)).toBe("1K")
    expect(formatCount(1500)).toBe("1.5K")
    expect(formatCount(128000)).toBe("128K")
  })

  it("formats millions", () => {
    expect(formatCount(1000000)).toBe("1M")
    expect(formatCount(1500000)).toBe("1.5M")
  })

  it("formats billions", () => {
    expect(formatCount(1000000000)).toBe("1B")
  })

  it("handles negative numbers", () => {
    expect(formatCount(-1500)).toBe("-1.5K")
  })
})

describe("normalizeCHString", () => {
  it("treats nullish as empty", () => {
    expect(normalizeCHString(undefined)).toBe("")
    expect(normalizeCHString(null)).toBe("")
    expect(isBlankCHString(undefined)).toBe(true)
  })

  it("strips NUL padding from FixedString-style values", () => {
    expect(normalizeCHString("abc\0\0")).toBe("abc")
    expect(normalizeCHString("\0\0")).toBe("")
    expect(isBlankCHString("\0\0")).toBe(true)
  })

  it("strips zero-width/BOM and trims", () => {
    expect(normalizeCHString("\u200Bx\uFEFF")).toBe("x")
    expect(normalizeCHString("  id  ")).toBe("id")
  })
})

describe("parseCHDate", () => {
  it("parses ClickHouse datetime strings as UTC", () => {
    expect(parseCHDate("2026-03-25 10:00:00.123").toISOString()).toBe("2026-03-25T10:00:00.123Z")
  })

  it("accepts already-normalized ISO timestamps", () => {
    expect(parseCHDate("2026-03-25T10:00:00.123Z").toISOString()).toBe("2026-03-25T10:00:00.123Z")
  })

  it("returns the provided fallback on invalid input", () => {
    const fallback = new Date("2026-01-01T00:00:00.000Z")
    expect(parseCHDate("not-a-date", { fallback })).toBe(fallback)
  })
})

describe("formatPrice", () => {
  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0")
  })

  it("formats normal prices", () => {
    expect(formatPrice(2.5)).toBe("$2.50")
    expect(formatPrice(10)).toBe("$10.00")
  })

  it("formats very small prices with 3 decimals", () => {
    expect(formatPrice(0.003)).toBe("$0.003")
  })

  it("shows enough decimals for very small values", () => {
    expect(formatPrice(0.0000075)).toBe("$0.0000075")
    expect(formatPrice(0.0001)).toBe("$0.0001")
    expect(formatPrice(0.0009)).toBe("$0.0009")
  })
})

describe("formatDuration", () => {
  const SECOND = 1_000_000_000
  const MINUTE = 60 * SECOND
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR
  const YEAR = 365 * DAY

  it("keeps fractional precision below a minute (µs/ms/s)", () => {
    expect(formatDuration(500_000)).toBe("500.0µs")
    expect(formatDuration(12_300_000)).toBe("12.3ms")
    expect(formatDuration(1_500_000_000)).toBe("1.50s")
    expect(formatDuration(45 * SECOND)).toBe("45.00s")
  })

  it("formats single whole units from a minute up", () => {
    expect(formatDuration(1 * MINUTE)).toBe("1m")
    expect(formatDuration(1 * HOUR)).toBe("1h")
    expect(formatDuration(1 * DAY)).toBe("1d")
    expect(formatDuration(1 * YEAR)).toBe("1y")
  })

  it("keeps the two most-significant non-zero units", () => {
    expect(formatDuration(1 * MINUTE + 30 * SECOND)).toBe("1m 30s")
    expect(formatDuration(2 * HOUR + 5 * MINUTE)).toBe("2h 5m")
    expect(formatDuration(1 * DAY + 6 * HOUR)).toBe("1d 6h")
    expect(formatDuration(1 * YEAR + 2 * DAY)).toBe("1y 2d")
  })

  it("drops units beyond the top two", () => {
    expect(formatDuration(1 * DAY + 1 * HOUR + 1 * MINUTE + 1 * SECOND)).toBe("1d 1h")
  })
})
