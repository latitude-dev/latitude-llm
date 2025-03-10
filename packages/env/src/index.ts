import { resolve } from 'path'
import { cwd } from 'process'

import { createEnv } from '@t3-oss/env-core'
import dotenv, { type DotenvPopulateInput } from 'dotenv'
import z from 'zod'

const environment = process.env.NODE_ENV || 'development'
const UPLOADS_PATH = 'uploads'

const buildPublicWebPath = (rootPath: string) =>
  `${rootPath}/apps/web/public/${UPLOADS_PATH}`

/**
 * Dear developer. You only need to do this once.
 * Create a .env.development file in the root of the project if
 * you haven't already. Add the following line to the file:
 *
 * DEV_ROOT_PATH=/path/to/latitude
 *
 * Example: DEV_ROOT_PATH=/Users/YOUR_MACHINE_NAME/your-path-to/latitude
 * It has to be an absolute path.
 */
function buildDevStoragePaths() {
  const devRootPath = process.env.DEV_ROOT_PATH

  if (!devRootPath) {
    console.error(`
  \x1b[31m[ERROR]\x1b[0m DEV_ROOT_PATH is missing!
  Please define the \x1b[33mDEV_ROOT_PATH\x1b[0m environment variable in:
  \x1b[36m.env.development\x1b[0m (located in the root of the project).
  `)
    process.exit(1)
  }

  const storagePath = `${devRootPath}/${UPLOADS_PATH}`

  return { storagePath, publicStoragePath: buildPublicWebPath(devRootPath) }
}

const TEST_STORAGE_PATHS = {
  storagePath: `/tmp/${UPLOADS_PATH}`,
  publicStoragePath: buildPublicWebPath('/tmp'),
}

if (environment === 'development' || environment === 'test') {
  const pathToEnv = resolve(cwd(), `../../.env.${environment}`)

  dotenv.config({ path: pathToEnv })
  const {
    storagePath: FILES_STORAGE_PATH,
    publicStoragePath: PUBLIC_FILES_STORAGE_PATH,
  } =
    environment === 'development' ? buildDevStoragePaths() : TEST_STORAGE_PATHS

  dotenv.populate(
    process.env as DotenvPopulateInput,
    {
      CACHE_HOST: '0.0.0.0',
      COPILOT_EVALUATION_SUGGESTION_PROMPT_PATH: 'evaluation-generator',
      COPILOT_GENERATE_TOOL_RESPONSES_PATH: 'tool-responses-generator',
      DATABASE_URL: `postgres://latitude:secret@localhost:5432/latitude_${environment}`,
      DRIVE_DISK: 'local',
      FILES_STORAGE_PATH,
      PUBLIC_FILES_STORAGE_PATH,
      FROM_MAILER_EMAIL: 'hello@latitude.so',
      GATEWAY_HOSTNAME: 'localhost',
      GATEWAY_PORT: '8787',
      GATEWAY_SSL: 'false',
      APP_DOMAIN: 'latitude.so',
      APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_POSTHOG_HOST: '',
      NEXT_PUBLIC_POSTHOG_KEY: '',
      NODE_ENV: environment,
      QUEUE_HOST: '0.0.0.0',
      COPILOT_TEMPLATES_SUGGESTION_PROMPT_PATH: 'generator',
      WEBSOCKETS_SERVER: 'http://localhost:4002',
      WEBSOCKET_REFRESH_SECRET_TOKEN_KEY: 'refresh-refresh-token-key',
      WEBSOCKET_SECRET_TOKEN_KEY: 'secret-token-key',
      LATITUDE_CLOUD_PAYMENT_URL: 'https://fake-payment-url.com',
      BULL_ADMIN_USER: 'admin',
      BULL_ADMIN_PASS: 'admin',
      MCP_SCHEME: 'internet-facing',
      MCP_DOCKER_IMAGE: 'ghcr.io/latitude-dev/latitude-mcp:sha-dd84ff4',
      MCP_NODE_GROUP_NAME: 'latitude-dev-node-group',
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

    // Cache
    CACHE_HOST: z.string(),
    CACHE_PORT: z.coerce.number().optional().default(6379),

    // Postgres
    DATABASE_URL: z.string().url(),

    // Default settings when creating a new workspace
    DEFAULT_PROJECT_ID: z.coerce.number().optional(),
    DEFAULT_PROVIDER_API_KEY: z.string().optional(),
    NEXT_PUBLIC_DEFAULT_PROVIDER_NAME: z.string(),

    APP_DOMAIN: z.string(),
    APP_URL: z.string().url(),

    // Posthog
    NEXT_PUBLIC_POSTHOG_HOST: z.string(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string(),

    // Queue
    QUEUE_HOST: z.string(),
    QUEUE_PASSWORD: z.string().optional(),
    QUEUE_PORT: z.coerce.number().optional().default(6379),

    // Websockets
    WEBSOCKETS_SERVER: z.string(),
    WEBSOCKET_REFRESH_SECRET_TOKEN_KEY: z.string(),
    WEBSOCKET_SECRET_TOKEN_KEY: z.string(),

    // Support app (intercom)
    SUPPORT_APP_SECRET_KEY: z.string().optional(),
    NEXT_PUBLIC_SUPPORT_APP_ID: z.string().optional(),

    // AWS
    AWS_ACCESS_KEY: z.string().optional(),
    AWS_ACCESS_SECRET: z.string().optional(),
    AWS_REGION: z.string().optional(),

    // File storage
    DRIVE_DISK: z.union([z.literal('local'), z.literal('s3')]).optional(),
    FILES_STORAGE_PATH: z.string().optional(),
    FILE_PUBLIC_PATH: z.string().optional(),
    PUBLIC_FILES_STORAGE_PATH: z.string().optional(),
    PUBLIC_S3_BUCKET: z.string().optional(),
    S3_BUCKET: z.string().optional(),

    // Sentry
    SENTRY_DSN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),

    // Gateway
    GATEWAY_HOSTNAME: z.string(),
    GATEWAY_PORT: z.coerce.number().optional(),
    GATEWAY_SSL: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .default('true'),

    LATITUDE_CLOUD: z.boolean().optional().default(false),

    // Copilot
    COPILOT_CODE_SUGGESTION_PROMPT_PATH: z.string().optional(),
    COPILOT_DATASET_GENERATOR_PROMPT_PATH: z.string().optional(),
    COPILOT_EVALUATION_SUGGESTION_PROMPT_PATH: z.string().optional(),
    COPILOT_GENERATE_TOOL_RESPONSES_PATH: z.string().optional(),
    COPILOT_PROJECT_ID: z.coerce.number().optional(),
    COPILOT_REFINE_PROMPT_PATH: z.string().optional(),
    COPILOT_WORKSPACE_API_KEY: z.string().optional(),
    COPILOT_TEMPLATES_SUGGESTION_PROMPT_PATH: z.string().optional(),

    LOOPS_API_KEY: z.string().optional(),
    CODESANDBOX_API_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),
    HANDINGER_API_KEY: z.string().optional(),

    // Mail settings
    FROM_MAILER_EMAIL: z.string(),
    MAILGUN_HOST: z.string().optional(),
    MAILGUN_PROTOCOL: z.string().optional(),
    MAILGUN_EMAIL_DOMAIN: z.string().optional(),
    MAILGUN_MAILER_API_KEY: z.string().optional(),
    DISABLE_EMAIL_AUTHENTICATION: z.boolean().optional().default(false),

    // Workers
    WORKERS_HOST: z.string().optional(),
    WORKERS_PORT: z.coerce.number().optional(),

    // BullMQ dashboard
    BULL_ADMIN_USER: z.string(),
    BULL_ADMIN_PASS: z.string(),

    // MCP Server feature configurations
    MCP_NODE_GROUP_NAME: z.string(),
    MCP_DOCKER_IMAGE: z.string(),
    MCP_SCHEME: z.string(),
    EKS_CA_DATA: z.string().optional(),
    EKS_CLUSTER_NAME: z.string().optional(),
    K8S_API_URL: z.string().optional(),
    LATITUDE_MCP_HOST: z.string().optional(),
    USE_EKS_CLUSTER: z.coerce.boolean().optional().default(false),

    // Triggers
    NEXT_PUBLIC_EMAIL_TRIGGER_DOMAIN: z.string().optional(),
    MAILGUN_WEBHOOK_SIGNING_KEY: z.string().optional(),

    ENCRYPTION_KEY: z.string().optional(),
  },
  runtimeEnv: {
    ...process.env,
    CACHE_PORT: process.env.CACHE_PORT ?? '6379',
    NEXT_PUBLIC_DEFAULT_PROVIDER_NAME: 'Latitude', // TODO: Move to env in infra
    DEFAULT_PROVIDER_API_KEY: process.env.DEFAULT_PROVIDER_API_KEY,
    DRIVE_DISK: process.env.DRIVE_DISK ?? 'local',
    FILE_PUBLIC_PATH: process.env.FILE_PUBLIC_PATH ?? UPLOADS_PATH,
    QUEUE_PORT: process.env.QUEUE_PORT ?? '6379',
    SUPPORT_APP_ID: process.env.SUPPORT_APP_ID ?? '',
    SUPPORT_APP_SECRET_KEY: process.env.SUPPORT_APP_SECRET_KEY ?? '',
    LOOPS_API_KEY: process.env.LOOPS_API_KEY ?? '',
    LATITUDE_CLOUD: process.env.LATITUDE_CLOUD === 'true',
    LATITUDE_CLOUD_PAYMENT_URL: process.env.LATITUDE_CLOUD_PAYMENT_URL,
    DISABLE_EMAIL_AUTHENTICATION:
      process.env.DISABLE_EMAIL_AUTHENTICATION === 'true',
  },
})
