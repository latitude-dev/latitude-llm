import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    NODE_ENV: z.string(),
    DATABASE_URL: z.string(),
    WEBSOCKETS_SERVER: z.string(),
    DATASET_GENERATOR_WORKSPACE_APIKEY: z.string(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    WEBSOCKETS_SERVER: process.env.WEBSOCKETS_SERVER,
    DATASET_GENERATOR_WORKSPACE_APIKEY: process.env.DATASET_GENERATOR_WORKSPACE_APIKEY,
  },
})
