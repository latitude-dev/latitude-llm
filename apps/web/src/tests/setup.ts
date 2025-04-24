import setupTestDatabase from '@latitude-data/core/test'
import { vi } from 'vitest'

setupTestDatabase()

vi.mock('$/jobs/queues', () => ({
  queues: {
    eventsQueue: {
      jobs: {},
    },
  },
}))
