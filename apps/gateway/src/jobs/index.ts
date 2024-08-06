import { setupJobs } from '@latitude-data/jobs'
import env from '$/common/env'

export const { queues } = setupJobs({
  connectionParams: {
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
    password: env.REDIS_PASSWORD,
  },
})
