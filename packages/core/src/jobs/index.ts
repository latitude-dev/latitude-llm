import { env } from '@latitude-data/env'
import { setupJobs } from '@latitude-data/jobs'

export const jobs = setupJobs({
  connectionParams: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },
}) as ReturnType<typeof setupJobs>
