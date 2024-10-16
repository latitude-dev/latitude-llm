import { join, resolve } from 'path'
import { cwd } from 'process'
import { fileURLToPath } from 'url'

import { createEnv } from '@t3-oss/env-core'
import dotenv, { type DotenvPopulateInput } from 'dotenv'
import z from 'zod'

const environment = process.env.NODE_ENV || 'development'
const __dirname = fileURLToPath(import.meta.url)
const FILE_PUBLIC_PATH = 'uploads'

if (environment === 'development' || environment === 'test') {
  const pathToEnv = resolve(cwd(), `../../.env.${environment}`)
  const FILES_STORAGE_PATH = join(
    __dirname,
    `../../../../tmp/${FILE_PUBLIC_PATH}`,
  )

  dotenv.populate(
    process.env as DotenvPopulateInput,
    {
      NODE_ENV: environment,
      FROM_MAILER_EMAIL: 'hello@latitude.so',
      DATABASE_URL: `postgres://latitude:secret@localhost:5432/latitude_${environment}`,
      QUEUE_PORT: '6379',
      QUEUE_HOST: '0.0.0.0',
      CACHE_PORT: '6379',
      CACHE_HOST: '0.0.0.0',
      GATEWAY_PORT: '8787',
      GATEWAY_HOSTNAME: 'localhost',
      GATEWAY_SSL: 'false',
      LATITUDE_DOMAIN: 'latitude.so',
      LATITUDE_EMAIL_DOMAIN: 'mail.latitude.so',
      LATITUDE_URL: 'http://localhost:3000',
      WEBSOCKETS_SERVER: 'http://localhost:4002',
      WEBSOCKET_SECRET_TOKEN_KEY: 'secret-token-key',
      WEBSOCKET_REFRESH_SECRET_TOKEN_KEY: 'refresh-refresh-token-key',
      WORKERS_WEBSOCKET_SECRET_TOKEN: 'workers-secret-token',
      DRIVE_DISK: 'local',
      FILE_PUBLIC_PATH,
      FILES_STORAGE_PATH,
      DEFAULT_PROJECT_ID: '1',
      NEXT_PUBLIC_POSTHOG_KEY: '',
      NEXT_PUBLIC_POSTHOG_HOST: '',
      COPILOT_WORKSPACE_API_KEY: 'e2c21df6-4e2d-4703-9b65-5f4dee0add23', // fake
      DEFAULT_PROVIDER_API_KEY: '33275751-f0c4-46f3-bc9a-cd2fb22d86ca', // fake
      DATASET_GENERATOR_WORKSPACE_APIKEY:
        '33275751-f0c4-46f3-bc9a-cd2fb22d86ca', // fake
      DATASET_GENERATOR_DOCUMENT_PATH: 'generator',
      TEMPLATES_SUGGESTION_PROJECT_ID: '10',
      TEMPLATES_SUGGESTION_PROMPT_PATH: 'generator',
      COPILOT_PROJECT_ID: '10',
      COPILOT_EVALUATION_SUGGESTION_PROMPT_PATH: 'generator',
    },
    { path: pathToEnv },
  )

  dotenv.config({ path: pathToEnv })
}

export const env = createEnv({
  skipValidation:
    process.env.BUILDING_CONTAINER == 'true' || process.env.NODE_ENV === 'test',
  server: {
    CACHE_HOST: z.string(),
    DATABASE_URL: z.string().url(),
    DEFAULT_PROJECT_ID: z.coerce.number(),
    DEFAULT_PROVIDER_API_KEY: z.string(),
    DEFAULT_PROVIDER_ID: z.string(),
    FROM_MAILER_EMAIL: z.string(),
    GATEWAY_HOSTNAME: z.string(),
    LATITUDE_DOMAIN: z.string(),
    LATITUDE_EMAIL_DOMAIN: z.string().optional(),
    LATITUDE_URL: z.string().url(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string(),
    SUPPORT_APP_SECRET_KEY: z.string().optional(),
    NEXT_PUBLIC_SUPPORT_APP_ID: z.string().optional(),
    NODE_ENV: z.string(),
    QUEUE_HOST: z.string(),
    WEBSOCKETS_SERVER: z.string(),
    WEBSOCKET_REFRESH_SECRET_TOKEN_KEY: z.string(),
    WEBSOCKET_SECRET_TOKEN_KEY: z.string(),
    WORKERS_WEBSOCKET_SECRET_TOKEN: z.string(),
    AWS_ACCESS_KEY: z.string().optional(),
    AWS_ACCESS_SECRET: z.string().optional(),
    AWS_REGION: z.string().optional(),
    CACHE_PORT: z.coerce.number().optional().default(6379),
    DRIVE_DISK: z.union([z.literal('local'), z.literal('s3')]).optional(),
    FILES_STORAGE_PATH: z.string().optional(),
    FILE_PUBLIC_PATH: z.string().optional(),
    MAILER_API_KEY: z.string().optional(),
    MAILGUN_MAILER_API_KEY: z.string().optional(),
    QUEUE_PASSWORD: z.string().optional(),
    QUEUE_PORT: z.coerce.number().optional().default(6379),
    S3_BUCKET: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    GATEWAY_PORT: z.coerce.number().optional(),
    GATEWAY_SSL: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .default('true'),
    COPILOT_WORKSPACE_API_KEY: z.string().optional(),
    COPILOT_PROJECT_ID: z.coerce.number().optional(),
    COPILOT_REFINE_PROMPT_PATH: z.string().optional(),
    COPILOT_CODE_SUGGESTION_PROMPT_PATH: z.string().optional(),
    DATASET_GENERATOR_PROJECT_ID: z.coerce.number().optional(),
    DATASET_GENERATOR_DOCUMENT_PATH: z.string().optional(),
    DATASET_GENERATOR_WORKSPACE_APIKEY: z.string().optional(),
    TEMPLATES_SUGGESTION_PROJECT_ID: z.coerce.number().optional(),
    TEMPLATES_SUGGESTION_PROMPT_PATH: z.string().optional(),
    COPILOT_EVALUATION_SUGGESTION_PROMPT_PATH: z.string().optional(),
  },
  runtimeEnv: {
    ...process.env,
    CACHE_PORT: process.env.CACHE_PORT ?? '6379',
    DEFAULT_PROVIDER_ID: 'Latitude',
    DRIVE_DISK: process.env.DRIVE_DISK ?? 'local',
    FILE_PUBLIC_PATH: process.env.FILE_PUBLIC_PATH ?? FILE_PUBLIC_PATH,
    QUEUE_PORT: process.env.QUEUE_PORT ?? '6379',
    SUPPORT_APP_ID: process.env.SUPPORT_APP_ID ?? '',
    SUPPORT_APP_SECRET_KEY: process.env.SUPPORT_APP_SECRET_KEY ?? '',
  },
})
