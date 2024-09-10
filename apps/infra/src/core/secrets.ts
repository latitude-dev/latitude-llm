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

export const mailerApiKeyArn = mailerApiKey.arn
export const sentryDsnArn = sentryDsn.arn
export const sentryOrgArn = sentryOrg.arn
export const sentryProjectArn = sentryProject.arn
export const awsAccessKeyArn = awsAccessKey.arn
export const awsAccessSecretArn = awsAccessSecret.arn
