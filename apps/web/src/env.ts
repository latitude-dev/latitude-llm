import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

console.log("DATASET_GENERATOR_PROJECT_ID", process.env.DATASET_GENERATOR_PROJECT_ID)
console.log("DOCUMENT_PATH", process.env.DATASET_GENERATOR_DOCUMENT_PATH)
console.log("WORKSPACE_APIKEY", process.env.DATASET_GENERATOR_WORKSPACE_APIKEY)

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    NODE_ENV: z.string(),
    DATABASE_URL: z.string(),
    WEBSOCKETS_SERVER: z.string(),
  },
  runtimeEnv: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    WEBSOCKETS_SERVER: process.env.WEBSOCKETS_SERVER,
  },
})
