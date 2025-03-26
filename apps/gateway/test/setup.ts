import useTestDatabase from '@latitude-data/core/test'
import { vi } from 'vitest'

useTestDatabase()

vi.mock('$/jobs/queues', () => ({
  queues: {
    eventsQueue: {
      jobs: {},
    },
  },
}))
