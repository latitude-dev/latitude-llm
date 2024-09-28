import '@latitude-data/env'

import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export default createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    NODE_ENV: z.string(),
    DATABASE_URL: z.string(),
    GATEWAY_HOSTNAME: z.string(),
    WEBSOCKETS_SERVER: z.string(),
    GATEWAY_PORT: z.coerce.number().optional(),
    GATEWAY_SSL: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .default('true'),
    DATASET_GENERATOR_PROJECT_ID: z.coerce.number().optional(),
    DATASET_GENERATOR_DOCUMENT_PATH: z.string().optional(),
    DATASET_GENERATOR_WORKSPACE_APIKEY: z.string().optional(),
    TEMPLATES_SUGGESTION_PROJECT_ID: z.coerce.number().optional(),
    TEMPLATES_SUGGESTION_PROMPT_PATH: z.string().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    GATEWAY_HOSTNAME: process.env.GATEWAY_HOSTNAME,
    GATEWAY_PORT: process.env.GATEWAY_PORT,
    GATEWAY_SSL: process.env.GATEWAY_SSL,
    WEBSOCKETS_SERVER: process.env.WEBSOCKETS_SERVER,
    DATASET_GENERATOR_PROJECT_ID: process.env.DATASET_GENERATOR_PROJECT_ID,
    DATASET_GENERATOR_DOCUMENT_PATH:
      process.env.DATASET_GENERATOR_DOCUMENT_PATH,
    DATASET_GENERATOR_WORKSPACE_APIKEY:
      process.env.DATASET_GENERATOR_WORKSPACE_APIKEY,
    TEMPLATES_SUGGESTION_PROJECT_ID:
      process.env.TEMPLATES_SUGGESTION_PROJECT_ID,
    TEMPLATES_SUGGESTION_PROMPT_PATH:
      process.env.TEMPLATES_SUGGESTION_PROMPT_PATH,
  },
})
