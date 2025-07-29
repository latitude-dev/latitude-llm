import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isScheduledTriggerDue,
  updateScheduledTriggerLastRun,
  findAllScheduledTriggers,
  findScheduledTriggersDueToRun,
} from './index'
import * as cronHelperModule from '../../helpers/cronHelper'
import { createScheduledDocumentTrigger } from '../../../../tests/factories/documentTriggers'
import { ScheduledTriggerConfiguration } from '@latitude-data/constants/documentTriggers'

describe('Scheduled Document Triggers Handlers', () => {
  beforeEach(() => {
    // Reset mocks for cronHelper functions
    vi.resetAllMocks()

    // Mock cronHelper functions
    vi.spyOn(cronHelperModule, 'checkCronExpression')
    vi.spyOn(cronHelperModule, 'getNextRunTime').mockReturnValue(
      new Date('2023-01-02'),
    )

    // Mock console.log and console.error
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('isScheduledTriggerDue', () => {
    it('returns true when nextRunTime is in the past', async () => {
      // Arrange
      const pastDate = new Date()
      pastDate.setHours(pastDate.getHours() - 1) // 1 hour ago

      const trigger = await createScheduledDocumentTrigger({
        cronExpression: '0 * * * *',
        nextRunTime: pastDate,
      })

      // Act
      const result = isScheduledTriggerDue(trigger)

      // Assert
      expect(result).toBe(true)
      expect(cronHelperModule.checkCronExpression).not.toHaveBeenCalled()
    })

    it('returns false when nextRunTime is in the future', async () => {
      // Arrange
      const futureDate = new Date()
      futureDate.setHours(futureDate.getHours() + 1) // 1 hour in the future

      const trigger = await createScheduledDocumentTrigger({
        cronExpression: '0 * * * *',
        nextRunTime: futureDate,
      })

      // Act
      const result = isScheduledTriggerDue(trigger)

      // Assert
      expect(result).toBe(false)
      expect(cronHelperModule.checkCronExpression).not.toHaveBeenCalled()
    })

    it('falls back to checking cron expression when nextRunTime is not set', async () => {
      // Arrange
      const lastRun = new Date('2023-01-01')
      const trigger = await createScheduledDocumentTrigger({
        cronExpression: '0 * * * *',
        lastRun,
        nextRunTime: undefined,
      })

      // Mock checkCronExpression to return true for this test
      vi.mocked(cronHelperModule.checkCronExpression).mockReturnValueOnce(true)

      // Act
      const result = isScheduledTriggerDue(trigger)

      // Assert
      expect(result).toBe(true)
      expect(cronHelperModule.checkCronExpression).toHaveBeenCalledWith(
        '0 * * * *',
        'UTC',
        lastRun.toISOString(),
      )
    })

    it('uses createdAt as reference when lastRun is not set', async () => {
      // Arrange
      const trigger = await createScheduledDocumentTrigger({
        cronExpression: '0 * * * *',
        lastRun: undefined,
      })

      // Act
      isScheduledTriggerDue(trigger)

      // Assert
      expect(cronHelperModule.checkCronExpression).toHaveBeenCalledWith(
        '0 * * * *',
        'UTC',
        expect.any(String), // createdAt is a string and we don't care about the value
      )
    })
  })

  describe('updateScheduledTriggerLastRun', () => {
    it('updates the lastRun and nextRunTime for a trigger with full configuration', async () => {
      // Arrange
      const now = new Date()
      const trigger = await createScheduledDocumentTrigger({
        cronExpression: '0 * * * *',
        lastRun: new Date('2023-01-01'),
      })

      // Act
      const result = await updateScheduledTriggerLastRun(trigger, now)

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value!.id).toEqual(trigger.id)
        expect(
          (result.value!.configuration as ScheduledTriggerConfiguration)
            .lastRun,
        ).toEqual(now.toISOString())
        expect(
          (result.value!.configuration as ScheduledTriggerConfiguration)
            .nextRunTime,
        ).toEqual(new Date('2023-01-02').toISOString())
      }
      expect(cronHelperModule.getNextRunTime).toHaveBeenCalledWith(
        '0 * * * *',
        'UTC',
        now,
      )
    })

    it('fetches the full trigger when only partial trigger is provided', async () => {
      // Arrange
      const now = new Date()
      const fullTrigger = await createScheduledDocumentTrigger({
        cronExpression: '0 * * * *',
        lastRun: new Date('2023-01-01'),
      })

      const partialTrigger = {
        id: fullTrigger.id,
        uuid: fullTrigger.uuid,
      }

      // Act
      const result = await updateScheduledTriggerLastRun(partialTrigger, now)

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value!.id).toEqual(fullTrigger.id)
        expect(
          (result.value!.configuration as ScheduledTriggerConfiguration)
            .lastRun,
        ).toEqual(now.toISOString())
        expect(
          (result.value!.configuration as ScheduledTriggerConfiguration)
            .nextRunTime,
        ).toEqual(new Date('2023-01-02').toISOString())
      }
    })

    it('returns an error when trigger is not found', async () => {
      // Arrange
      const nonExistentTrigger = {
        id: 999999,
        uuid: 'non-existent-uuid',
      }

      // Act
      const result = await updateScheduledTriggerLastRun(nonExistentTrigger)

      // Assert
      expect(result.ok).toBe(false)
      expect(result.error?.message).toBe('Trigger with id 999999 not found')
    })
  })

  describe('findAllScheduledTriggers', () => {
    it('returns all scheduled triggers', async () => {
      // Arrange
      const trigger1 = await createScheduledDocumentTrigger({
        cronExpression: '0 * * * *',
      })

      const trigger2 = await createScheduledDocumentTrigger({
        cronExpression: '0 0 * * *',
      })

      // Act
      const result = await findAllScheduledTriggers()

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value!.length).toBeGreaterThanOrEqual(2)
        expect(result.value!.some((t) => t.id === trigger1.id)).toBe(true)
        expect(result.value!.some((t) => t.id === trigger2.id)).toBe(true)
      }
    })
  })

  describe('findScheduledTriggersDueToRun', () => {
    it('returns triggers with nextRunTime in the past', async () => {
      // Arrange
      const now = new Date()
      const pastDate = new Date(now.getTime() - 3600000) // 1 hour ago

      const dueTrigger = await createScheduledDocumentTrigger({
        cronExpression: '0 * * * *',
        nextRunTime: pastDate,
      })

      const futureTrigger = await createScheduledDocumentTrigger({
        cronExpression: '0 * * * *',
        nextRunTime: new Date(now.getTime() + 3600000), // 1 hour in future
      })

      // Act
      const result = await findScheduledTriggersDueToRun()

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        const dueIds = result.value!.map((t) => t.id)
        expect(dueIds).toContain(dueTrigger.id)
        expect(dueIds).not.toContain(futureTrigger.id)
      }
    })

    it('filters triggers without nextRunTime using cron expression', async () => {
      // Arrange
      // Create a trigger without nextRunTime
      const triggerWithoutNextRunTime = await createScheduledDocumentTrigger({
        cronExpression: '0 0 * * *',
        nextRunTime: undefined,
        lastRun: new Date('2023-01-01'),
      })

      // Mock checkCronExpression to return true for this test
      vi.mocked(cronHelperModule.checkCronExpression).mockReturnValueOnce(true)

      // Act
      const result = await findScheduledTriggersDueToRun()

      // Assert
      expect(result.ok).toBe(true)
      if (result.ok) {
        const dueIds = result.value!.map((t) => t.id)
        expect(dueIds).toContain(triggerWithoutNextRunTime.id)
      }
      expect(cronHelperModule.checkCronExpression).toHaveBeenCalled()
    })
  })
})
