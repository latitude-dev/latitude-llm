import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { StackReference } from '@pulumi/pulumi'

export const coreStack = new StackReference('core')

const dbUsername = coreStack.requireOutput('dbUsername')
const dbPasswordSecretId = coreStack.requireOutput('dbPasswordSecretId')
const dbEndpoint = coreStack.requireOutput('dbEndpoint')
const dbName = coreStack.requireOutput('dbName')
const dbPassword = dbPasswordSecretId.apply((secretId) =>
  aws.secretsmanager
    .getSecretVersion({
      secretId: secretId,
    })
    .then((secret) => secret.secretString),
)
const mailerApiKeyArn = coreStack.requireOutput('mailerApiKeyArn')
const cacheEndpoint = coreStack.requireOutput('cacheEndpoint')
const mailerApiKey = mailerApiKeyArn.apply((arn) => {
  const secret = aws.secretsmanager.getSecretVersionOutput({
    secretId: arn,
  })

  return secret.secretString
})

export const dbUrl = pulumi.interpolate`postgresql://${dbUsername}:${dbPassword}@${dbEndpoint}/${dbName}?sslmode=verify-full&sslrootcert=/app/packages/core/src/assets/eu-central-1-bundle.pem`
export const environment = pulumi
  .all([cacheEndpoint, dbUrl, mailerApiKey])
  .apply(() => {
    return [
      { name: 'HOSTNAME', value: '0.0.0.0' },
      { name: 'PORT', value: '8080' },
      { name: 'DATABASE_URL', value: dbUrl },
      { name: 'REDIS_HOST', value: cacheEndpoint },
      { name: 'GATEWAY_HOSTNAME', value: 'gateway.latitude.so' },
      { name: 'GATEWAY_SSL', value: 'true' },
      { name: 'LATITUDE_DOMAIN', value: 'latitude.so' },
      { name: 'LATITUDE_URL', value: 'https://app.latitude.so' },
      { name: 'FROM_MAILER_EMAIL', value: 'hello@latitude.so' },
      { name: 'MAILER_API_KEY', value: mailerApiKey },
      { name: 'SENTRY_DNS', value: coreStack.requireOutput('sentryDns') },
      { name: 'SENTRY_ORG', value: coreStack.requireOutput('sentryOrg') },
      {
        name: 'SENTRY_PROJECT',
        value: coreStack.requireOutput('sentryProject'),
      },
    ]
  })
