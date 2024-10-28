import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { StackReference } from '@pulumi/pulumi'

export const coreStack = new StackReference('core')

const dbUsername = coreStack.requireOutput('dbUsername')
const dbPasswordSecretId = coreStack.requireOutput('dbPasswordSecretId')
const dbEndpoint = coreStack.requireOutput('dbEndpoint')
const dbName = coreStack.requireOutput('dbName')
const mailerApiKeyArn = coreStack.requireOutput('mailerApiKeyArn')
const mailgunMailerApiKeyArn = coreStack.requireOutput('mailgunMailerApiKeyArn')
const queueEndpoint = coreStack.requireOutput('queueEndpoint')
const cacheEndpoint = coreStack.requireOutput('cacheEndpoint')
const awsAccessKeyArn = coreStack.requireOutput('awsAccessKeyArn')
const awsAccessSecretArn = coreStack.requireOutput('awsAccessSecretArn')
const websocketsSecretTokenArn = coreStack.requireOutput(
  'websocketsSecretTokenArn',
)
const websocketsSecretRefreshTokenArn = coreStack.requireOutput(
  'websocketsSecretRefreshTokenArn',
)
const workersWebsocketsSecretTokenArn = coreStack.requireOutput(
  'workersWebsocketsSecretTokenArn',
)
const sentryDsnArn = coreStack.requireOutput('sentryDsnArn')
const sentryOrgArn = coreStack.requireOutput('sentryOrgArn')
const sentryProjectArn = coreStack.requireOutput('sentryProjectArn')
const defaultProjectIdArn = coreStack.requireOutput('defaultProjectIdArn')
const defaultProviderApiKeyArn = coreStack.requireOutput(
  'defaultProviderApiKeyArn',
)
const postHogApiKeyArn = coreStack.requireOutput('postHogApiKeyArn')
const datasetGeneratorWorkspaceApiKeyArn = coreStack.requireOutput(
  'datasetGeneratorWorkspaceApiKeyArn',
)
const supportAppIdArn = coreStack.requireOutput('supportAppIdArn')
const supportAppSecretKeyArn = coreStack.requireOutput('supportAppSecretKeyArn')
const loopsSecretApiKeyArn = coreStack.requireOutput('loopsSecretApiKeyArn')

const getSecretString = (arn: pulumi.Output<any>) => {
  return arn.apply((secretId) =>
    aws.secretsmanager
      .getSecretVersion({
        secretId: secretId,
      })
      .then((secret) => secret.secretString),
  )
}

const dbPassword = getSecretString(dbPasswordSecretId)
const mailerApiKey = getSecretString(mailerApiKeyArn)
const mailgunMailerApiKey = getSecretString(mailgunMailerApiKeyArn)
const awsAccessKey = getSecretString(awsAccessKeyArn)
const awsAccessSecret = getSecretString(awsAccessSecretArn)
const websocketSecretToken = getSecretString(websocketsSecretTokenArn)
const websocketSecretRefreshToken = getSecretString(
  websocketsSecretRefreshTokenArn,
)
const workersWebsocketsSecretToken = getSecretString(
  workersWebsocketsSecretTokenArn,
)
const defaultProjectId = getSecretString(defaultProjectIdArn)

export const sentryDsn = getSecretString(sentryDsnArn)
export const sentryOrg = getSecretString(sentryOrgArn)
export const sentryProject = getSecretString(sentryProjectArn)
export const defaultProviderApiKey = getSecretString(defaultProviderApiKeyArn)
export const postHogApiKey = getSecretString(postHogApiKeyArn)
export const supportAppId = getSecretString(supportAppIdArn)
export const supportAppSecretKey = getSecretString(supportAppSecretKeyArn)
export const loopsSecretApiKey = getSecretString(loopsSecretApiKeyArn)
export const datasetGeneratorWorkspaceApiKey = getSecretString(
  datasetGeneratorWorkspaceApiKeyArn,
)

export const copilotWorkspaceApiKey = coreStack.requireOutput(
  'copilotWorkspaceApiKey',
)
export const copilotProjectId = coreStack.requireOutput('copilotProjectId')
export const copilotRefinePromptPath = coreStack.requireOutput(
  'copilotRefinePromptPath',
)
export const copilotCodeSuggestionPromptPath = coreStack.requireOutput(
  'copilotCodeSuggestionPromptPath',
)
export const copilotEvaluationSuggestionPromptPath = coreStack.requireOutput(
  'copilotEvaluationSuggestionPromptPath',
)

export const dbUrl = pulumi.interpolate`postgresql://${dbUsername}:${dbPassword}@${dbEndpoint}/${dbName}?sslmode=verify-full&sslrootcert=/app/packages/core/src/assets/eu-central-1-bundle.pem`
export const environment = pulumi
  .all([
    awsAccessKey,
    awsAccessSecret,
    queueEndpoint,
    cacheEndpoint,
    dbUrl,
    mailerApiKey,
    sentryDsn,
    sentryOrg,
    sentryProject,
    defaultProjectId,
    defaultProviderApiKey,
    postHogApiKey,
    datasetGeneratorWorkspaceApiKey,
    copilotWorkspaceApiKey,
    copilotProjectId,
    copilotRefinePromptPath,
    copilotCodeSuggestionPromptPath,
    copilotEvaluationSuggestionPromptPath,
    supportAppId,
    supportAppSecretKey,
    loopsSecretApiKey,
  ])
  .apply(() => {
    return [
      { name: 'HOSTNAME', value: '0.0.0.0' }, // This is the host gateway listens to within its container
      { name: 'PORT', value: '8080' },
      { name: 'DATABASE_URL', value: dbUrl },
      { name: 'QUEUE_HOST', value: queueEndpoint },
      { name: 'CACHE_HOST', value: cacheEndpoint },
      { name: 'GATEWAY_HOSTNAME', value: 'gateway.latitude.so' }, // This is the host gateway is available at
      { name: 'GATEWAY_SSL', value: 'true' },
      { name: 'LATITUDE_DOMAIN', value: 'latitude.so' },
      { name: 'LATITUDE_EMAIL_DOMAIN', value: 'mail.latitude.so' },
      { name: 'LATITUDE_URL', value: 'https://app.latitude.so' },
      { name: 'WEBSOCKETS_SERVER', value: 'https://ws.latitude.so' },
      { name: 'WEBSOCKETS_SERVER_PORT', value: '8080' },
      { name: 'WEBSOCKET_SECRET_TOKEN_KEY', value: websocketSecretToken },
      {
        name: 'WEBSOCKET_REFRESH_SECRET_TOKEN_KEY',
        value: websocketSecretRefreshToken,
      },
      {
        name: 'WORKERS_WEBSOCKET_SECRET_TOKEN',
        value: workersWebsocketsSecretToken,
      },
      { name: 'FROM_MAILER_EMAIL', value: 'hello@latitude.so' },
      { name: 'MAILER_API_KEY', value: mailerApiKey },
      { name: 'MAILGUN_MAILER_API_KEY', value: mailgunMailerApiKey },
      { name: 'SENTRY_DSN', value: sentryDsn },
      { name: 'SENTRY_ORG', value: sentryOrg },
      {
        name: 'SENTRY_PROJECT',
        value: sentryProject,
      },
      { name: 'DRIVE_DISK', value: 's3' },
      { name: 'ASW_REGION', value: 'eu-central-1' },
      { name: 'S3_BUCKET', value: 'latitude-llm-bucket-production' },
      { name: 'AWS_ACCESS_KEY', value: awsAccessKey },
      { name: 'AWS_ACCESS_SECRET', value: awsAccessSecret },
      { name: 'DEFAULT_PROJECT_ID', value: defaultProjectId },
      { name: 'DEFAULT_PROVIDER_API_KEY', value: defaultProviderApiKey },
      { name: 'NEXT_PUBLIC_POSTHOG_KEY', value: postHogApiKey },
      { name: 'NEXT_PUBLIC_POSTHOG_HOST', value: 'https://eu.i.posthog.com' },
      {
        name: 'DATASET_GENERATOR_WORKSPACE_APIKEY',
        value: datasetGeneratorWorkspaceApiKey,
      },
      { name: 'DATASET_GENERATOR_PROJECT_ID', value: '74' },
      { name: 'DATASET_GENERATOR_DOCUMENT_PATH', value: 'generator' },
      {
        name: 'TEMPLATES_SUGGESTION_PROMPT_PATH',
        value: 'evaluation-template-suggestions',
      },
      { name: 'TEMPLATES_SUGGESTION_PROJECT_ID', value: '60' },
      { name: 'COPILOT_WORKSPACE_API_KEY', value: copilotWorkspaceApiKey },
      {
        name: 'COPILOT_EVALUATION_SUGGESTION_PROMPT_PATH',
        value: copilotEvaluationSuggestionPromptPath,
      },
      { name: 'COPILOT_PROJECT_ID', value: copilotProjectId },
      { name: 'COPILOT_REFINE_PROMPT_PATH', value: copilotRefinePromptPath },
      {
        name: 'COPILOT_CODE_SUGGESTION_PROMPT_PATH',
        value: copilotCodeSuggestionPromptPath,
      },
      { name: 'SUPPORT_APP_ID', value: supportAppId },
      { name: 'SUPPORT_APP_SECRET_KEY', value: supportAppSecretKey },
      { name: 'LOOPS_API_KEY', value: loopsSecretApiKey },
    ]
  })
