import { env } from '@latitude-data/env'
import { setupJobs } from '@latitude-data/jobs'

export const { queues } = setupJobs({
  connectionParams: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },
})
