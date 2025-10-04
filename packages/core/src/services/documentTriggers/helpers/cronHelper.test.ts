import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { checkCronExpression, getNextRunTime } from './cronHelper'

describe('cronHelper', () => {
  beforeAll(() => {
    // Mock the current time to a specific date for consistent testing
    vi.useFakeTimers()
    // Set to January 15, 2025, 10:00:00 UTC (Tuesday)
    vi.setSystemTime(new Date('2025-01-15T10:00:00.000Z'))
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  describe('checkCronExpression', () => {
    describe('UTC timezone', () => {
      it('should return true when the cron expression should trigger (hourly)', () => {
        const cronExpression = '0 * * * *' // Every hour at minute 0
        const lastRunDate = new Date('2025-01-15T09:00:00.000Z') // Last run at 9:00 UTC

        const result = checkCronExpression(cronExpression, 'UTC', lastRunDate)

        // Next run would be 10:00 UTC, which is now, so it should trigger
        expect(result).toBe(true)
      })

      it('should return false when the cron expression should not trigger yet', () => {
        const cronExpression = '0 * * * *' // Every hour at minute 0
        const lastRunDate = new Date('2025-01-15T10:00:00.000Z') // Last run at 10:00 UTC (now)

        const result = checkCronExpression(cronExpression, 'UTC', lastRunDate)

        // Next run would be 11:00 UTC, which is in the future, so it should not trigger
        expect(result).toBe(false)
      })

      it('should return true when no last run date is provided and cron should have triggered', () => {
        const cronExpression = '0 9 * * *' // Daily at 9:00 AM

        const result = checkCronExpression(cronExpression, 'UTC')

        // Since we're at 10:00 UTC and the job should run at 9:00 UTC daily, it should trigger
        expect(result).toBe(true)
      })
    })

    describe('America/New_York timezone (EST/EDT)', () => {
      it('should handle timezone conversion correctly for EST', () => {
        const cronExpression = '0 5 * * *' // 5:00 AM in New York timezone
        const lastRunDate = new Date('2025-01-14T10:00:00.000Z') // Yesterday 10:00 UTC

        const result = checkCronExpression(
          cronExpression,
          'America/New_York',
          lastRunDate,
        )

        // 5:00 AM EST = 10:00 AM UTC, which is our current time, so it should trigger
        expect(result).toBe(true)
      })

      it('should not trigger when the next run is in the future in the specified timezone', () => {
        const cronExpression = '0 6 * * *' // 6:00 AM in New York timezone
        const lastRunDate = new Date('2025-01-15T10:00:00.000Z') // Today 10:00 UTC (5:00 AM EST)

        const result = checkCronExpression(
          cronExpression,
          'America/New_York',
          lastRunDate,
        )

        // 6:00 AM EST = 11:00 AM UTC, which is in the future, so it should not trigger
        expect(result).toBe(false)
      })
    })

    describe('Europe/London timezone (GMT/BST)', () => {
      it('should handle timezone conversion correctly for GMT', () => {
        const cronExpression = '0 10 * * *' // 10:00 AM in London timezone
        const lastRunDate = new Date('2025-01-14T10:00:00.000Z') // Yesterday 10:00 UTC

        const result = checkCronExpression(
          cronExpression,
          'Europe/London',
          lastRunDate,
        )

        // In January, London is GMT (same as UTC), so 10:00 AM GMT = 10:00 AM UTC, should trigger
        expect(result).toBe(true)
      })
    })

    describe('Asia/Tokyo timezone (JST)', () => {
      it('should handle timezone conversion correctly for JST', () => {
        const cronExpression = '0 19 * * *' // 7:00 PM in Tokyo timezone
        const lastRunDate = new Date('2025-01-14T10:00:00.000Z') // Yesterday 10:00 UTC

        const result = checkCronExpression(
          cronExpression,
          'Asia/Tokyo',
          lastRunDate,
        )

        // 7:00 PM JST = 10:00 AM UTC, which is our current time, so it should trigger
        expect(result).toBe(true)
      })

      it('should not trigger when the next run is in the future in JST', () => {
        const cronExpression = '0 20 * * *' // 8:00 PM in Tokyo timezone
        const lastRunDate = new Date('2025-01-15T10:00:00.000Z') // Today 10:00 UTC (7:00 PM JST)

        const result = checkCronExpression(
          cronExpression,
          'Asia/Tokyo',
          lastRunDate,
        )

        // 8:00 PM JST = 11:00 AM UTC, which is in the future, so it should not trigger
        expect(result).toBe(false)
      })
    })

    describe('Weekly and monthly expressions', () => {
      it('should handle weekly expressions with timezones', () => {
        const cronExpression = '0 5 * * 2' // Every Tuesday at 5:00 AM in specified timezone
        const lastRunDate = new Date('2025-01-07T10:00:00.000Z') // Previous Tuesday

        const result = checkCronExpression(
          cronExpression,
          'America/New_York',
          lastRunDate,
        )

        // Today is Tuesday, 5:00 AM EST = 10:00 AM UTC, should trigger
        expect(result).toBe(true)
      })

      it('should handle monthly expressions with timezones', () => {
        const cronExpression = '0 5 15 * *' // 15th of every month at 5:00 AM in specified timezone
        const lastRunDate = new Date('2024-12-15T10:00:00.000Z') // Previous month

        const result = checkCronExpression(
          cronExpression,
          'America/New_York',
          lastRunDate,
        )

        // Today is the 15th, 5:00 AM EST = 10:00 AM UTC, should trigger
        expect(result).toBe(true)
      })
    })

    describe('Error handling', () => {
      it('should return false for invalid cron expressions', () => {
        const invalidCronExpression = 'invalid cron'
        const lastRunDate = new Date('2025-01-15T09:00:00.000Z')

        const result = checkCronExpression(
          invalidCronExpression,
          'UTC',
          lastRunDate,
        )

        expect(result).toBe(false)
      })

      it('should handle invalid timezones gracefully', () => {
        const cronExpression = '0 * * * *'
        const lastRunDate = new Date('2025-01-15T09:00:00.000Z')

        const result = checkCronExpression(
          cronExpression,
          'Invalid/Timezone',
          lastRunDate,
        )

        expect(result).toBe(false)
      })
    })
  })

  describe('getNextRunTime', () => {
    describe('UTC timezone', () => {
      it('should calculate next run time correctly for hourly expression', () => {
        const cronExpression = '0 * * * *' // Every hour at minute 0
        const startDate = new Date('2025-01-15T10:30:00.000Z')

        const result = getNextRunTime(cronExpression, 'UTC', startDate)

        // Next run should be at 11:00 UTC
        expect(result).toEqual(new Date('2025-01-15T11:00:00.000Z'))
      })

      it('should calculate next run time correctly for daily expression', () => {
        const cronExpression = '0 9 * * *' // Daily at 9:00 AM
        const startDate = new Date('2025-01-15T10:00:00.000Z')

        const result = getNextRunTime(cronExpression, 'UTC', startDate)

        // Next run should be tomorrow at 9:00 UTC
        expect(result).toEqual(new Date('2025-01-16T09:00:00.000Z'))
      })

      it('should use current time as default start date', () => {
        const cronExpression = '0 11 * * *' // Daily at 11:00 AM

        const result = getNextRunTime(cronExpression, 'UTC')

        // Next run should be at 11:00 UTC today (since current time is 10:00 UTC)
        expect(result).toEqual(new Date('2025-01-15T11:00:00.000Z'))
      })
    })

    describe('America/New_York timezone (EST/EDT)', () => {
      it('should calculate next run time correctly in EST', () => {
        const cronExpression = '0 6 * * *' // 6:00 AM Eastern
        const startDate = new Date('2025-01-15T10:00:00.000Z') // 5:00 AM EST

        const result = getNextRunTime(
          cronExpression,
          'America/New_York',
          startDate,
        )

        // Next run should be at 6:00 AM EST = 11:00 AM UTC
        expect(result).toEqual(new Date('2025-01-15T11:00:00.000Z'))
      })

      it('should handle day boundary correctly in different timezone', () => {
        const cronExpression = '0 23 * * *' // 11:00 PM Eastern
        const startDate = new Date('2025-01-15T10:00:00.000Z') // 5:00 AM EST

        const result = getNextRunTime(
          cronExpression,
          'America/New_York',
          startDate,
        )

        // Next run should be at 11:00 PM EST = 4:00 AM UTC next day
        expect(result).toEqual(new Date('2025-01-16T04:00:00.000Z'))
      })
    })

    describe('Europe/London timezone (GMT/BST)', () => {
      it('should calculate next run time correctly in GMT (winter)', () => {
        const cronExpression = '0 15 * * *' // 3:00 PM GMT
        const startDate = new Date('2025-01-15T10:00:00.000Z') // 10:00 AM GMT

        const result = getNextRunTime(
          cronExpression,
          'Europe/London',
          startDate,
        )

        // Next run should be at 3:00 PM GMT = 3:00 PM UTC (same in winter)
        expect(result).toEqual(new Date('2025-01-15T15:00:00.000Z'))
      })
    })

    describe('Asia/Tokyo timezone (JST)', () => {
      it('should calculate next run time correctly in JST', () => {
        const cronExpression = '0 20 * * *' // 8:00 PM JST
        const startDate = new Date('2025-01-15T10:00:00.000Z') // 7:00 PM JST

        const result = getNextRunTime(cronExpression, 'Asia/Tokyo', startDate)

        // Next run should be at 8:00 PM JST = 11:00 AM UTC
        expect(result).toEqual(new Date('2025-01-15T11:00:00.000Z'))
      })

      it('should handle next day correctly when crossing date line', () => {
        const cronExpression = '0 1 * * *' // 1:00 AM JST
        const startDate = new Date('2025-01-15T10:00:00.000Z') // 7:00 PM JST

        const result = getNextRunTime(cronExpression, 'Asia/Tokyo', startDate)

        // Next run should be at 1:00 AM JST next day = 4:00 PM UTC same day
        expect(result).toEqual(new Date('2025-01-15T16:00:00.000Z'))
      })
    })

    describe('Weekly expressions with timezones', () => {
      it('should calculate next weekly run correctly', () => {
        const cronExpression = '0 9 * * 1' // Every Monday at 9:00 AM
        const startDate = new Date('2025-01-15T10:00:00.000Z') // Tuesday

        const result = getNextRunTime(
          cronExpression,
          'America/New_York',
          startDate,
        )

        // Next Monday (Jan 20) at 9:00 AM EST = 2:00 PM UTC
        expect(result).toEqual(new Date('2025-01-20T14:00:00.000Z'))
      })
    })

    describe('Error handling', () => {
      it('should return null for invalid cron expressions', () => {
        const invalidCronExpression = 'invalid cron'
        const startDate = new Date('2025-01-15T10:00:00.000Z')

        const result = getNextRunTime(invalidCronExpression, 'UTC', startDate)

        expect(result).toBeNull()
      })

      it('should return null for invalid timezones', () => {
        const cronExpression = '0 * * * *'
        const startDate = new Date('2025-01-15T10:00:00.000Z')

        const result = getNextRunTime(
          cronExpression,
          'Invalid/Timezone',
          startDate,
        )

        expect(result).toBeNull()
      })
    })
  })

  describe('Daylight Saving Time scenarios', () => {
    describe('Spring forward (DST starts)', () => {
      beforeAll(() => {
        // Set time to March 10, 2025, 6:00 AM UTC (1:00 AM EST, just before DST)
        vi.setSystemTime(new Date('2025-03-10T06:00:00.000Z'))
      })

      afterAll(() => {
        // Reset to original test time
        vi.setSystemTime(new Date('2025-01-15T10:00:00.000Z'))
      })

      it('should handle DST transition correctly for getNextRunTime', () => {
        const cronExpression = '0 3 * * *' // 3:00 AM Eastern (during DST transition)
        const startDate = new Date('2025-03-10T06:00:00.000Z') // 1:00 AM EST

        const result = getNextRunTime(
          cronExpression,
          'America/New_York',
          startDate,
        )

        // On DST day, 3:00 AM EST becomes 3:00 AM EDT = 7:00 AM UTC
        expect(result).toEqual(new Date('2025-03-10T07:00:00.000Z'))
      })
    })

    describe('Fall back (DST ends)', () => {
      beforeAll(() => {
        // Set time to November 2, 2025, 5:00 AM UTC (1:00 AM EST, after DST ends)
        vi.setSystemTime(new Date('2025-11-02T05:00:00.000Z'))
      })

      afterAll(() => {
        // Reset to original test time
        vi.setSystemTime(new Date('2025-01-15T10:00:00.000Z'))
      })

      it('should handle DST transition correctly when falling back', () => {
        const cronExpression = '0 2 * * *' // 2:00 AM Eastern (during DST transition)
        const startDate = new Date('2025-11-02T05:00:00.000Z') // 1:00 AM EST

        const result = getNextRunTime(
          cronExpression,
          'America/New_York',
          startDate,
        )

        // After DST ends, 2:00 AM EST = 7:00 AM UTC
        expect(result).toEqual(new Date('2025-11-02T07:00:00.000Z'))
      })
    })
  })

  describe('Edge cases and boundary conditions', () => {
    it('should handle leap year correctly', () => {
      vi.setSystemTime(new Date('2024-02-28T10:00:00.000Z'))

      const cronExpression = '0 10 29 2 *' // February 29th at 10:00 AM

      const result = getNextRunTime(cronExpression, 'UTC')

      // Should find February 29, 2024 (leap year)
      expect(result).toEqual(new Date('2024-02-29T10:00:00.000Z'))

      vi.setSystemTime(new Date('2025-01-15T10:00:00.000Z')) // Reset
    })

    it('should handle end of year boundary', () => {
      vi.setSystemTime(new Date('2024-12-31T23:00:00.000Z'))

      const cronExpression = '0 1 1 1 *' // January 1st at 1:00 AM

      const result = getNextRunTime(cronExpression, 'UTC')

      // Should find January 1, 2025
      expect(result).toEqual(new Date('2025-01-01T01:00:00.000Z'))

      vi.setSystemTime(new Date('2025-01-15T10:00:00.000Z')) // Reset
    })

    it('should handle same day but earlier time correctly', () => {
      const cronExpression = '0 8 * * *' // 8:00 AM daily
      const startDate = new Date('2025-01-15T10:00:00.000Z') // 10:00 AM same day

      const result = getNextRunTime(cronExpression, 'UTC', startDate)

      // Should be next day at 8:00 AM
      expect(result).toEqual(new Date('2025-01-16T08:00:00.000Z'))
    })
  })
})
