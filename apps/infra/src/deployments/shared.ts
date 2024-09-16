import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { StackReference } from '@pulumi/pulumi'

export const coreStack = new StackReference('core')

const dbUsername = coreStack.requireOutput('dbUsername')
const dbPasswordSecretId = coreStack.requireOutput('dbPasswordSecretId')
const dbEndpoint = coreStack.requireOutput('dbEndpoint')
const dbName = coreStack.requireOutput('dbName')
const mailerApiKeyArn = coreStack.requireOutput('mailerApiKeyArn')
const queueEndpoint = coreStack.requireOutput('queueEndpoint')
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
const awsAccessKey = getSecretString(awsAccessKeyArn)
const awsAccessSecret = getSecretString(awsAccessSecretArn)
const websocketSecretToken = getSecretString(websocketsSecretTokenArn)
const websocketSecretRefreshToken = getSecretString(
  websocketsSecretRefreshTokenArn,
)
const workersWebsocketsSecretToken = getSecretString(
  workersWebsocketsSecretTokenArn,
)

export const sentryDsn = getSecretString(sentryDsnArn)
export const sentryOrg = getSecretString(sentryOrgArn)
export const sentryProject = getSecretString(sentryProjectArn)

export const dbUrl = pulumi.interpolate`postgresql://${dbUsername}:${dbPassword}@${dbEndpoint}/${dbName}?sslmode=verify-full&sslrootcert=/app/packages/core/src/assets/eu-central-1-bundle.pem`
export const environment = pulumi
  .all([
    awsAccessKey,
    awsAccessSecret,
    queueEndpoint,
    dbUrl,
    mailerApiKey,
    sentryDsn,
    sentryOrg,
    sentryProject,
  ])
  .apply(() => {
    return [
      { name: 'HOSTNAME', value: '0.0.0.0' },
      { name: 'PORT', value: '8080' },
      { name: 'DATABASE_URL', value: dbUrl },
      { name: 'QUEUE_HOST', value: queueEndpoint },
      { name: 'GATEWAY_HOSTNAME', value: 'gateway.latitude.so' },
      { name: 'GATEWAY_SSL', value: 'true' },
      { name: 'LATITUDE_DOMAIN', value: 'latitude.so' },
      { name: 'LATITUDE_URL', value: 'https://app.latitude.so' },
      { name: 'WEBSOCKETS_SERVER', value: 'ws.latitude.so' },
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
    ]
  })
