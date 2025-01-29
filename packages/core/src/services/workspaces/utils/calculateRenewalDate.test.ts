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
})
