import useTestDatabase from '@latitude-data/core'
import { vi } from 'vitest'

useTestDatabase()

vi.mock('$/jobs/queues', () => ({
  queues: {
    eventsQueue: {
      jobs: {},
    },
  },
}))
