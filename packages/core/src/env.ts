import { createEnv } from '@t3-oss/env-core'
import z from 'zod'

import '@latitude-data/env'

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    NODE_ENV: z.string(),
    DATABASE_URL: z.string().url(),
  },
  runtimeEnv: process.env,
})
