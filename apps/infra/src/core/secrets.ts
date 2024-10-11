import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

const config = new pulumi.Config()

function createSecretWithVersion(
  name: string,
  description: string,
): aws.secretsmanager.Secret {
  const secret = new aws.secretsmanager.Secret(name, {
    description: description,
    name: name,
  })

  new aws.secretsmanager.SecretVersion(`${name}_VERSION`, {
    secretId: secret.id,
    secretString: config.requireSecret(name),
  })

  return secret
}

const mailerApiKey = createSecretWithVersion(
  'MAILER_API_KEY',
  'API key for the mailer service',
)
const sentryDsn = createSecretWithVersion(
  'SENTRY_DSN',
  'DSN for Sentry error tracking',
)
const sentryOrg = createSecretWithVersion(
  'SENTRY_ORG',
  'Organization for Sentry error tracking',
)
const sentryProject = createSecretWithVersion(
  'SENTRY_PROJECT',
  'Project for Sentry error tracking',
)

const awsAccessKey = createSecretWithVersion(
  'LATITUDE_LLM_AWS_ACCESS_KEY',
  'AWS access key',
)
const awsAccessSecret = createSecretWithVersion(
  'LATITUDE_LLM_AWS_ACCESS_SECRET',
  'AWS access secret',
)

const websocketsSecretToken = createSecretWithVersion(
  'WEBSOCKET_SECRET_TOKEN_KEY',
  'Secret token key for websockets in web',
)
const websocketsSecretRefreshToken = createSecretWithVersion(
  'WEBSOCKET_REFRESH_SECRET_TOKEN_KEY',
  'Refresh token key for websockets in web',
)
const workersWebsocketsSecretToken = createSecretWithVersion(
  'WORKERS_WEBSOCKET_SECRET_TOKEN',
  'Secret token key for websockets in workers',
)
const defaultProjectId = createSecretWithVersion(
  'DEFAULT_PROJECT_ID',
  'Default project ID',
)
const defaultProviderApiKey = createSecretWithVersion(
  'DEFAULT_PROVIDER_API_KEY',
  'Default provider API key',
)
const postHogApiKey = createSecretWithVersion(
  'NEXT_PUBLIC_POSTHOG_KEY',
  'Posthog API Key for product analytics',
)
const datasetGeneratorWorkspaceApiKey = createSecretWithVersion(
  'DATASET_GENERATOR_WORKSPACE_APIKEY',
  'API key for the dataset generator',
)

export const copilotProjectId = config.requireSecret('COPILOT_PROJECT_ID')
export const copilotRefinePromptPath = config.requireSecret(
  'COPILOT_REFINE_PROMPT_PATH',
)
export const copilotCodeSuggestionPromptPath = config.requireSecret(
  'COPILOT_CODE_SUGGESTION_PROMPT_PATH',
)

export const mailerApiKeyArn = mailerApiKey.arn
export const sentryDsnArn = sentryDsn.arn
export const sentryOrgArn = sentryOrg.arn
export const sentryProjectArn = sentryProject.arn
export const awsAccessKeyArn = awsAccessKey.arn
export const awsAccessSecretArn = awsAccessSecret.arn
export const websocketsSecretTokenArn = websocketsSecretToken.arn
export const websocketsSecretRefreshTokenArn = websocketsSecretRefreshToken.arn
export const workersWebsocketsSecretTokenArn = workersWebsocketsSecretToken.arn
export const defaultProjectIdArn = defaultProjectId.arn
export const defaultProviderApiKeyArn = defaultProviderApiKey.arn
export const postHogApiKeyArn = postHogApiKey.arn
export const datasetGeneratorWorkspaceApiKeyArn =
  datasetGeneratorWorkspaceApiKey.arn
