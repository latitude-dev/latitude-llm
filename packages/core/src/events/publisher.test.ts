import { env } from '@latitude-data/env'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupJobs } from '../jobs'
import { publisher } from './publisher'

vi.mock('@latitude-data/env')
vi.mock('../jobs')

global.fetch = vi.fn()

describe('publisher', () => {
  const mockEvent = { type: 'TEST_EVENT', payload: {} } as any

  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('publishLater', () => {
    it('should publish via API when WORKERS is true', async () => {
      vi.mocked(env).WORKERS = true
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: 'Success' }),
      } as Response)

      await publisher.publishLater(mockEvent)

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/events/publish',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer fake-api-key',
          },
          body: JSON.stringify(mockEvent),
        },
      )
    })

    // TODO: fix this test, mocking of env is not working
    it.skip('should publish via queues when WORKERS is false', async () => {
      vi.mocked(env).WORKERS = false
      const mockQueues = {
        eventsQueue: {
          jobs: {
            enqueueCreateEventJob: vi.fn(),
            enqueuePublishEventJob: vi.fn(),
            enqueuePublishToAnalyticsJob: vi.fn(),
          },
        },
      }
      vi.mocked(setupJobs).mockResolvedValue(mockQueues as any)

      await publisher.publishLater(mockEvent)

      expect(
        mockQueues.eventsQueue.jobs.enqueueCreateEventJob,
      ).toHaveBeenCalledWith(mockEvent)
      expect(
        mockQueues.eventsQueue.jobs.enqueuePublishEventJob,
      ).toHaveBeenCalledWith(mockEvent)
      expect(
        mockQueues.eventsQueue.jobs.enqueuePublishToAnalyticsJob,
      ).toHaveBeenCalledWith(mockEvent)
    })

    it('should throw an error when API request fails', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'API Error' }),
      } as Response)

      await expect(publisher.publishLater(mockEvent)).rejects.toThrow(
        'Failed to publish event: API Error',
      )
    })
  })
})
