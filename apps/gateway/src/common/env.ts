import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    DATABASE_URL: z.string(),
  },
  runtimeEnv: process.env,
})
