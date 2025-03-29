import { useTestDatabase } from '@latitude-data/core/tests'
import { vi } from 'vitest'

useTestDatabase()

vi.mock('$/jobs/queues', () => ({
  queues: {
    eventsQueue: {
      jobs: {},
    },
  },
}))
