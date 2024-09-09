import { resolve } from 'path'
import { fileURLToPath } from 'url'

import { createEnv } from '@t3-oss/env-core'
import dotenv, { type DotenvPopulateInput } from 'dotenv'
import z from 'zod'

const environment = process.env.NODE_ENV || 'development'

const __dirname = fileURLToPath(import.meta.url)
const pathToEnv = resolve(__dirname, `../../.env.${environment}`)

if (environment !== 'production') {
  dotenv.populate(
    process.env as DotenvPopulateInput,
    {
      NODE_ENV: environment,
      DATABASE_URL: `postgres://latitude:secret@localhost:5432/latitude_${environment}`,
      REDIS_PORT: '6379',
      REDIS_HOST: '0.0.0.0',
      GATEWAY_HOSTNAME: 'localhost',
      GATEWAY_PORT: '8787',
      GATEWAY_SSL: 'false',
      LATITUDE_DOMAIN: 'latitude.so',
      LATITUDE_URL: 'http://localhost:3000',
      FROM_MAILER_EMAIL: 'hello@latitude.so',
      DRIVE_DISK: 'local',
    },
    { path: pathToEnv },
  )

  dotenv.config({ path: pathToEnv })
}

export const env = createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    NODE_ENV: z.string(),
    DATABASE_URL: z.string().url(),
    REDIS_PORT: z.coerce.number().optional().default(6379),
    REDIS_HOST: z.string(),
    REDIS_PASSWORD: z.string().optional(),
    LATITUDE_URL: z.string().url(),
    MAILER_API_KEY: z.string().optional(),
    FROM_MAILER_EMAIL: z.string(),
    LATITUDE_DOMAIN: z.string(),
    AWS_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    AWS_ACCESS_KEY: z.string().optional(),
    AWS_ACCESS_SECRET: z.string().optional(),
    DRIVE_DISK: z
      .union([z.literal('local'), z.literal('s3')])
      .optional()
      .default('local'),
    SENTRY_DSN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
  },
  runtimeEnv: {
    ...process.env,
    // TODO: Remove once s3 is implemented
    DRIVE_DISK: 'local',
  },
})
