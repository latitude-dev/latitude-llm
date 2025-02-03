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
const mailgunMailerApiKey = createSecretWithVersion(
  'MAILGUN_MAILER_API_KEY',
  'API key for the Mailgun API mailer service',
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
export const copilotWorkspaceApiKey = config.requireSecret(
  'COPILOT_WORKSPACE_API_KEY',
)
export const copilotProjectId = config.requireSecret('COPILOT_PROJECT_ID')
export const copilotRefinePromptPath = config.requireSecret(
  'COPILOT_REFINE_PROMPT_PATH',
)
export const copilotCodeSuggestionPromptPath = config.requireSecret(
  'COPILOT_CODE_SUGGESTION_PROMPT_PATH',
)
export const copilotEvaluationSuggestionPromptPath = config.requireSecret(
  'COPILOT_EVALUATION_SUGGESTION_PROMPT_PATH',
)

const supportAppId = createSecretWithVersion(
  'SUPPORT_APP_ID',
  'Support app ID for the support chat',
)
const supportAppSecretKey = createSecretWithVersion(
  'SUPPORT_APP_SECRET_KEY',
  'Support app secret key for the support chat',
)

const loopsSecretApiKey = createSecretWithVersion(
  'LOOPS_API_KEY',
  'Marketing tool loops app secret key',
)

export const mailerApiKeyArn = mailerApiKey.arn
export const mailgunMailerApiKeyArn = mailgunMailerApiKey.arn
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
export const supportAppIdArn = supportAppId.arn
export const supportAppSecretKeyArn = supportAppSecretKey.arn
export const loopsSecretApiKeyArn = loopsSecretApiKey.arn
