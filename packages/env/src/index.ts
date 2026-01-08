import { resolve } from 'path'
import { cwd } from 'process'

import { createEnv } from '@t3-oss/env-core'
import dotenv, { type DotenvPopulateInput } from 'dotenv'
import z from 'zod'

const environment = process.env.NODE_ENV || 'development'
const UPLOADS_PATH = 'uploads'

if (environment === 'development' || environment === 'test') {
  const pathToEnv = resolve(cwd(), `../../.env.${environment}`)

  const isTest = environment === 'test'
  const FILES_STORAGE_PATH = isTest
    ? '/tmp/uploads'
    : (process.env.FILES_STORAGE_PATH ?? '/tmp')
  const PUBLIC_FILES_STORAGE_PATH = isTest
    ? '/tmp/apps/web/public/uploads'
    : (process.env.PUBLIC_FILES_STORAGE_PATH ?? '/tmp/uploads')

  dotenv.config({ path: pathToEnv })
  dotenv.populate(
    process.env as DotenvPopulateInput,
    {
      CACHE_HOST: '0.0.0.0',
      DATABASE_URL: `postgres://latitude:secret@localhost:5432/latitude_${environment}`,
      WEAVIATE_API_KEY: 'test-weaviate-key',
      WEAVIATE_HOST: '0.0.0.0',
      WEAVIATE_HTTP_PORT: '8099',
      WEAVIATE_GRPC_PORT: '50051',
      VOYAGE_API_KEY: 'test-voyage-key',
      DRIVE_DISK: 'local',
      FILES_STORAGE_PATH,
      PUBLIC_FILES_STORAGE_PATH,
      FROM_MAILER_EMAIL: 'hello@latitude.so',
      GATEWAY_HOSTNAME: 'localhost',
      GATEWAY_PORT: '8787',
      GATEWAY_SSL: 'false',
      GATEWAY_BIND_ADDRESS: 'localhost',
      GATEWAY_BIND_PORT: environment === 'development' ? '8787' : '8788',
      APP_DOMAIN: 'latitude.so',
      APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_DOCS_URL: 'http://localhost:3001',
      NEXT_PUBLIC_POSTHOG_HOST: '',
      NEXT_PUBLIC_POSTHOG_KEY: '',
      NODE_ENV: environment,
      QUEUE_HOST: '0.0.0.0',
      WEBSOCKETS_SERVER: 'http://localhost:4002',
      WEBSOCKET_REFRESH_SECRET_TOKEN_KEY: 'refresh-refresh-token-key',
      WEBSOCKET_SECRET_TOKEN_KEY: 'secret-token-key',
      LATITUDE_CLOUD_PAYMENT_URL: 'https://fake-payment-url.com',
      BULL_ADMIN_USER: 'admin',
      BULL_ADMIN_PASS: 'admin',
      MCP_SCHEME: 'internet-facing',
      MCP_DOCKER_IMAGE: 'ghcr.io/latitude-dev/latitude-mcp:latest',
      MCP_NODE_GROUP_NAME: 'latitude-dev-node-group',
      MAIL_TRANSPORT: 'mailpit',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback',
      ENABLE_ALL_FLAGS: 'false',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      COPILOT_PROMPT_EVALUATION_GENERATOR_V2_PATH: 'evaluation-v2-generator',
      COPILOT_TEMPLATES_SUGGESTION_PROMPT_PATH: 'generator',
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
    CACHE_PASSWORD: z.string().optional(),

    // Postgres
    DATABASE_URL: z.url(),
    READ_DATABASE_URL: z.url().optional(),
    READ_2_DATABASE_URL: z.url().optional(),

    // Weaviate
    WEAVIATE_URL: z.string().optional(),
    WEAVIATE_API_KEY: z.string().optional(),
    WEAVIATE_HOST: z.string().optional(),
    WEAVIATE_HTTP_PORT: z.coerce.number().optional().default(8099),
    WEAVIATE_GRPC_PORT: z.coerce.number().optional().default(50051),

    // Default settings when creating a new workspace
    DEFAULT_PROJECT_ID: z.coerce.number().optional(),
    DEFAULT_PROVIDER_API_KEY: z.string(),

    NEXT_PUBLIC_DEFAULT_PROVIDER_NAME: z.string(),

    APP_DOMAIN: z.string(),
    APP_URL: z.url(),

    // Posthog
    NEXT_PUBLIC_POSTHOG_HOST: z.string(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string(),
    OPT_OUT_ANALYTICS: z.boolean().optional().default(false),

    // Queue
    QUEUE_HOST: z.string(),
    QUEUE_PASSWORD: z.string().optional(),
    QUEUE_PORT: z.coerce.number().optional().default(6379),

    // Websockets
    WEBSOCKETS_SERVER: z.string(),
    WEBSOCKET_REFRESH_SECRET_TOKEN_KEY: z.string(),
    WEBSOCKET_SECRET_TOKEN_KEY: z.string(),
    WEBSOCKETS_COOKIES_DOMAIN: z.string().optional().default('localhost'),
    WEBSOCKETS_COOKIES_PATH: z.string().optional().default('/'),

    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),

    // Support app (intercom)
    SUPPORT_APP_ID: z.string(),
    SUPPORT_APP_SECRET_KEY: z.string().optional(),
    NEXT_PUBLIC_SUPPORT_APP_ID: z.string().optional(),

    // AWS
    AWS_ACCESS_KEY: z.string().optional(),
    AWS_ACCESS_SECRET: z.string().optional(),
    AWS_REGION: z.string().optional(),

    // Google Cloud Storage
    GCS_BUCKET: z.string().optional(),
    GCS_PUBLIC_BUCKET: z.string().optional(),
    GCS_PROJECT_ID: z.string().optional(),
    GCS_KEY_FILENAME: z.string().optional(),
    GCS_CLIENT_EMAIL: z.string().optional(),
    GCS_PRIVATE_KEY: z.string().optional(),

    // File storage
    DRIVE_DISK: z
      .union([z.literal('local'), z.literal('s3'), z.literal('gcs')])
      .optional(),
    FILES_STORAGE_PATH: z.string().optional(),
    FILE_PUBLIC_PATH: z.string().optional(),
    PUBLIC_FILES_STORAGE_PATH: z.string().optional(),
    PUBLIC_S3_BUCKET: z.string().optional(),
    S3_BUCKET: z.string().optional(),

    // Sentry
    SENTRY_WEB_DSN: z.string().optional(),
    SENTRY_GATEWAY_DSN: z.string().optional(),
    SENTRY_WORKERS_DSN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),

    // Gateway
    GATEWAY_WORKERS: z.coerce.number().optional(),
    GATEWAY_BIND_ADDRESS: z.string(),
    GATEWAY_BIND_PORT: z.coerce.number(),
    GATEWAY_HOSTNAME: z.string(),
    GATEWAY_PORT: z.coerce.number().optional(),
    GATEWAY_SSL: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional()
      .default(true),

    KEEP_ALIVE_TIMEOUT: z.coerce.number().optional().default(601000),

    LATITUDE_CLOUD: z.boolean().optional().default(false),
    LATITUDE_CLOUD_PAYMENT_URL: z.url().optional(),

    // Copilot
    COPILOT_PROMPT_ANNOTATION_GENERALIZER_PATH: z.string().optional(),
    COPILOT_PROMPT_EDITOR_COPILOT_PATH: z.string().optional(),
    COPILOT_PROMPT_DATASET_GENERATOR_PATH: z.string().optional(),
    COPILOT_PROMPT_ISSUE_EVALUATION_GENERATOR_PATH: z.string().optional(),
    COPILOT_PROMPT_EVALUATION_GENERATOR_V2_PATH: z.string().optional(),
    COPILOT_PROMPT_AGENT_DETAILS_GENERATOR_PATH: z.string().optional(),
    COPILOT_PROMPT_SIMULATE_TOOL_RESPONSES_PATH: z.string(),
    COPILOT_PROMPT_ISSUE_DETAILS_GENERATOR_PATH: z.string().optional(),
    COPILOT_GENERATE_TOOL_RESPONSES_COMMIT_UUID: z.string().optional(),
    COPILOT_PROJECT_ID: z.coerce.number().optional(),
    COPILOT_PROMPT_REFINE_PATH: z.string().optional(),
    COPILOT_WORKSPACE_API_KEY: z.string().optional(),
    COPILOT_LATTE_PROMPT_PATH: z.string().optional(),
    COPILOT_LATTE_CHANGES_FEEDBACK_HITL_EVALUATION_UUID: z.string().optional(),

    // Sample Agents
    SAMPLE_AGENTS_PROJECT_ID: z.coerce.number().optional(),

    LOOPS_API_KEY: z.string().optional(),
    CODESANDBOX_API_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),
    HANDINGER_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    VOYAGE_API_KEY: z.string().optional(),

    // Mail settings
    FROM_MAILER_EMAIL: z.string(),
    MAILGUN_HOST: z.string().optional(),
    MAILGUN_PROTOCOL: z.string().optional(),
    MAILGUN_EMAIL_DOMAIN: z.string().optional(),
    MAILGUN_MAILER_API_KEY: z.string().optional(),
    DISABLE_EMAIL_AUTHENTICATION: z.boolean().optional().default(false),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.union([z.string(), z.number()]).optional(),
    SMTP_SECURE: z.string().optional().default('true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_TRANSPORT: z
      .enum(['mailpit', 'mailgun', 'smtp'])
      .optional()
      .default('mailpit'),

    // Workers
    WORKERS_HOST: z.string().optional(),
    WORKERS_PORT: z.coerce.number().optional(),

    // BullMQ dashboard
    BULL_ADMIN_USER: z.string().optional().default('admin'),
    BULL_ADMIN_PASS: z.string().optional().default('admin'),

    // ECS Task Protection
    ECS_AGENT_URI: z.string().optional(),

    // MCP Server feature configurations
    EKS_CA_DATA: z.string().optional(),
    EKS_CLUSTER_NAME: z.string().optional(),
    K8S_API_URL: z.string().optional(),
    LATITUDE_MCP_HOST: z.string().optional(),
    MCP_DOCKER_IMAGE: z.string().optional(),
    MCP_NODE_GROUP_NAME: z.string().optional(),
    MCP_SCHEME: z.string().optional(),
    USE_EKS_CLUSTER: z.coerce.boolean().optional().default(false),

    // Triggers
    NEXT_PUBLIC_EMAIL_TRIGGER_DOMAIN: z.string().optional(),
    MAILGUN_WEBHOOK_SIGNING_KEY: z.string().optional(),

    // Encryption
    ENCRYPTION_KEY: z.string().optional(),

    SECURE_COOKIES: z.coerce.boolean().optional().default(false),
    SECURE_WEBSOCKETS: z.coerce.boolean().optional().default(false),

    JOB_RETRY_ATTEMPTS: z.coerce.number().optional().default(3),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    GOOGLE_REDIRECT_URI: z.string(),

    ENABLE_ALL_FLAGS: z.coerce.boolean().optional().default(false),
    IMPORT_DEFAULT_PROJECT: z.coerce.boolean().optional().default(false),

    LIMITED_VIEW_PROJECT_IDS: z.string().optional(),

    // Pipedream
    PIPEDREAM_ENVIRONMENT: z.enum(['development', 'production']).optional(),
    PIPEDREAM_CLIENT_ID: z.string().optional(),
    PIPEDREAM_CLIENT_SECRET: z.string().optional(),
    PIPEDREAM_PROJECT_ID: z.string().optional(),
    SLACK_DEFAULT_BOT_NAME: z.string().optional().default('Latitude'),
    SLACK_DEFAULT_BOT_ICON_URL: z
      .string()
      .optional()
      .default(
        'https://avatars.slack-edge.com/2022-04-13/3400058239233_835a74c233883cd5699b_88.png',
      ),

    // Workspaces in dev mode are created with this default workspace API key
    TEST_LATITUDE_API_KEY: z
      .string()
      .optional()
      .default('709a3398-ed26-4e77-beef-90ed288cdd0a'),

    RELEASE_VERSION: z.string().optional(),
  },
  runtimeEnv: {
    ...process.env,
    CACHE_PORT: process.env.CACHE_PORT ?? '6379',
    CACHE_PASSWORD: process.env.CACHE_PASSWORD,
    NEXT_PUBLIC_DEFAULT_PROVIDER_NAME: 'Latitude', // TODO: Move to env in infra
    DRIVE_DISK: process.env.DRIVE_DISK ?? 'local',
    FILE_PUBLIC_PATH: process.env.FILE_PUBLIC_PATH ?? UPLOADS_PATH,
    QUEUE_PORT: process.env.QUEUE_PORT ?? '6379',
    SUPPORT_APP_ID: process.env.SUPPORT_APP_ID ?? '',
    SUPPORT_APP_SECRET_KEY: process.env.SUPPORT_APP_SECRET_KEY ?? '',
    LOOPS_API_KEY: process.env.LOOPS_API_KEY ?? '',
    LATITUDE_CLOUD: process.env.LATITUDE_CLOUD === 'true',
    LATITUDE_CLOUD_PAYMENT_URL: process.env.LATITUDE_CLOUD_PAYMENT_URL,
    OPT_OUT_ANALYTICS: process.env.OPT_OUT_ANALYTICS === 'true',
    DISABLE_EMAIL_AUTHENTICATION:
      process.env.DISABLE_EMAIL_AUTHENTICATION === 'true',
    ENABLE_ALL_FLAGS: process.env.ENABLE_ALL_FLAGS === 'true',
    COPILOT_PROMPT_SIMULATE_TOOL_RESPONSES_PATH:
      process.env.COPILOT_PROMPT_SIMULATE_TOOL_RESPONSES_PATH ??
      'tool-responses-generator',
    DEFAULT_PROVIDER_API_KEY:
      process.env.DEFAULT_PROVIDER_API_KEY ?? 'default_api_key',
    ECS_AGENT_URI: process.env.ECS_AGENT_URI,
  },
})
