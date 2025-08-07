import { beforeEach, describe, expect, it, vi } from 'vitest'

import { relativeTime } from './relativeTime'

describe('relativeTime', () => {
  const SECONDS = 1000
  const MINUTES = 60 * SECONDS
  const HOURS = 60 * MINUTES
  const DAYS = 24 * HOURS
  const YEARS = 365 * DAYS
  const NOW = new Date(2000, 6, 31, 12, 0, 0)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('returns formatted relative time', () => {
    expect(relativeTime(new Date(NOW.getTime() - 3 * SECONDS))).toBe('Less than a minute ago')
    expect(relativeTime(new Date(NOW.getTime() - 30 * SECONDS))).toBe('1 minute ago')
    expect(relativeTime(new Date(NOW.getTime() - 30 * MINUTES))).toBe('30 minutes ago')
    expect(relativeTime(new Date(NOW.getTime() - 59 * MINUTES))).toBe('About 1 hour ago')
    expect(relativeTime(new Date(NOW.getTime() - 2 * HOURS))).toBe('Today at 10:00 AM')
    expect(relativeTime(new Date(NOW.getTime() - 3 * DAYS))).toBe('Last Friday at 12:00 PM')
    expect(relativeTime(new Date(NOW.getTime() - (6 * DAYS + 12 * HOURS)))).toBe(
      'Jul 25, 2000, 12:00:00 AM',
    )
    expect(relativeTime(new Date(NOW.getTime() - 7 * DAYS))).toBe('Jul 24, 2000, 12:00:00 PM')
    expect(relativeTime(new Date(NOW.getTime() - 1 * YEARS))).toBe('Aug 1, 1999, 12:00:00 PM')
  })

  it('returns "-" when no date is provided', () => {
    expect(relativeTime(null)).toBe('-')
    expect(relativeTime(undefined)).toBe('-')
  })
})
