import { setupJobs } from '@latitude-data/jobs'

import env from '../env'

export default setupJobs({
  connectionParams: {
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
    password: env.REDIS_PASSWORD,
  },
})
