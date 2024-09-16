import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

import { createEnv } from '@t3-oss/env-core'
import dotenv, { type DotenvPopulateInput } from 'dotenv'
import z from 'zod'

const environment = process.env.NODE_ENV || 'development'

const __dirname = fileURLToPath(import.meta.url)
const pathToEnv = resolve(__dirname, `../../.env.${environment}`)

const FILE_PUBLIC_PATH = 'uploads'
const FILES_STORAGE_PATH = join(
  __dirname,
  `../../../../tmp/${FILE_PUBLIC_PATH}`,
)

if (environment !== 'production') {
  dotenv.populate(
    process.env as DotenvPopulateInput,
    {
      NODE_ENV: environment,
      FROM_MAILER_EMAIL: 'hello@latitude.so',
      DATABASE_URL: `postgres://latitude:secret@localhost:5432/latitude_${environment}`,
      QUEUE_PORT: '6379',
      QUEUE_HOST: '0.0.0.0',
      GATEWAY_HOSTNAME: 'localhost',
      GATEWAY_PORT: '8787',
      GATEWAY_SSL: 'false',
      LATITUDE_DOMAIN: 'latitude.so',
      LATITUDE_URL: 'http://localhost:3000',
      WEBSOCKETS_SERVER: 'http://localhost:4002',
      WEBSOCKET_SECRET_TOKEN_KEY: 'secret-token-key',
      WEBSOCKET_REFRESH_SECRET_TOKEN_KEY: 'refresh-refresh-token-key',
      WORKERS_WEBSOCKET_SECRET_TOKEN: 'workers-secret-token',
      DRIVE_DISK: 'local',
      FILE_PUBLIC_PATH,
      FILES_STORAGE_PATH,
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
    QUEUE_HOST: z.string(),
    LATITUDE_URL: z.string().url(),
    FROM_MAILER_EMAIL: z.string(),
    LATITUDE_DOMAIN: z.string(),
    FILE_PUBLIC_PATH: z.string().optional(),
    FILES_STORAGE_PATH: z.string().optional(),
    QUEUE_PORT: z.coerce.number().optional().default(6379),
    QUEUE_PASSWORD: z.string().optional(),
    MAILER_API_KEY: z.string().optional(),
    AWS_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    AWS_ACCESS_KEY: z.string().optional(),
    AWS_ACCESS_SECRET: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    DRIVE_DISK: z
      .union([z.literal('local'), z.literal('s3')])
      .optional()
      .default('local'),
    WEBSOCKETS_SERVER: z.string(),
    WEBSOCKET_SECRET_TOKEN_KEY: z.string(),
    WORKERS_WEBSOCKET_SECRET_TOKEN: z.string(),
    WEBSOCKET_REFRESH_SECRET_TOKEN_KEY: z.string(),
  },
  runtimeEnv: {
    ...process.env,
    FILE_PUBLIC_PATH: process.env.FILE_PUBLIC_PATH ?? FILE_PUBLIC_PATH,
  },
})
