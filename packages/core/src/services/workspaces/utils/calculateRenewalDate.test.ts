import { describe, expect, it } from 'vitest'
import { getLatestRenewalDate } from './calculateRenewalDate'

describe('getLatestRenewalDate', () => {
  it('returns the first renewal date if the target date is before the first renewal date', () => {
    const firstRenewalDate = new Date(2000, 9, 12)
    const targetDate = new Date(1980, 1, 1)

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    expect(result).toEqual(firstRenewalDate)
  })

  it('returns the original date if a month has not yet passed', () => {
    const firstRenewalDate = new Date(2024, 9, 12)
    const targetDate = new Date(2024, 9, 15)

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    expect(result).toEqual(firstRenewalDate)
  })

  it('returns the same month as the target when the target day number is greater', () => {
    const firstRenewalDate = new Date(2000, 2, 12)
    const targetDate = new Date(2024, 5, 15)

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    expect(result).toEqual(new Date(2024, 5, 12))
  })

  it('returns the previous month as the target when the target day number is lesser', () => {
    const firstRenewalDate = new Date(2000, 2, 12)
    const targetDate = new Date(2024, 5, 10)

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    expect(result).toEqual(new Date(2024, 4, 12))
  })

  it('returns the same date as the target when the target day number is equal', () => {
    const firstRenewalDate = new Date(2000, 2, 12)
    const targetDate = new Date(2024, 5, 12)

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    expect(result).toEqual(new Date(2024, 5, 12))
  })

  it('returns the previous December when the target date is in January', () => {
    const firstRenewalDate = new Date(2000, 2, 12)
    const targetDate = new Date(2024, 0, 1) // 0 = January

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    expect(result).toEqual(new Date(2023, 11, 12))
  })

  it('clamps day 31 to day 28 when renewal falls in February (non-leap year)', () => {
    const firstRenewalDate = new Date(2024, 0, 31) // Jan 31
    const targetDate = new Date(2025, 2, 15) // March 15, 2025

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    // Should be Feb 28, 2025 (not March 3 which would happen without clamping)
    expect(result).toEqual(new Date(2025, 1, 28))
  })

  it('clamps day 31 to day 29 when renewal falls in February (leap year)', () => {
    const firstRenewalDate = new Date(2024, 0, 31) // Jan 31
    const targetDate = new Date(2024, 2, 15) // March 15, 2024 (leap year)

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    // Should be Feb 29, 2024 (leap year)
    expect(result).toEqual(new Date(2024, 1, 29))
  })

  it('clamps day 31 to day 30 when renewal falls in a 30-day month', () => {
    const firstRenewalDate = new Date(2024, 0, 31) // Jan 31
    const targetDate = new Date(2024, 4, 15) // May 15, 2024

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    // Should be April 30 (April has 30 days)
    expect(result).toEqual(new Date(2024, 3, 30))
  })

  it('does not clamp when renewal day exists in the target month', () => {
    const firstRenewalDate = new Date(2024, 0, 31) // Jan 31
    const targetDate = new Date(2024, 7, 15) // Aug 15, 2024

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    // Should be July 31 (July has 31 days)
    expect(result).toEqual(new Date(2024, 6, 31))
  })

  it('clamps day 30 to day 28 when renewal falls in February (non-leap year)', () => {
    const firstRenewalDate = new Date(2024, 3, 30) // Apr 30
    const targetDate = new Date(2025, 2, 15) // March 15, 2025

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    // Should be Feb 28, 2025
    expect(result).toEqual(new Date(2025, 1, 28))
  })

  it('clamps day 29 to day 28 when renewal falls in February (non-leap year)', () => {
    const firstRenewalDate = new Date(2024, 0, 29) // Jan 29
    const targetDate = new Date(2025, 2, 15) // March 15, 2025

    const result = getLatestRenewalDate(firstRenewalDate, targetDate)

    // Should be Feb 28, 2025
    expect(result).toEqual(new Date(2025, 1, 28))
  })
})
