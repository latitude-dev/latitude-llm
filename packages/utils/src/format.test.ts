import { describe, expect, it } from "vitest"
import { formatCount, formatPrice } from "./format.ts"

describe("formatCount", () => {
  it("returns small numbers as-is", () => {
    expect(formatCount(0)).toBe("0")
    expect(formatCount(42)).toBe("42")
    expect(formatCount(999)).toBe("999")
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
})
