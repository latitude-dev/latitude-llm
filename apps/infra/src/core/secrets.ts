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
const sentryDns = createSecretWithVersion(
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

const awsAccessKey = new aws.secretsmanager.Secret(
  'LATITUDE_LLM_AWS_ACCESS_KEY',
  {
    description: 'AWS access key',
    name: 'LATITUDE_LLM_AWS_ACCESS_KEY',
  },
)
const awsAccessSecret = new aws.secretsmanager.Secret(
  'LATITUDE_LLM_AWS_ACCESS_SECRET',
  {
    description: 'AWS access secret',
    name: 'LATITUDE_LLM_AWS_ACCESS_SECRET',
  },
)

new aws.secretsmanager.SecretVersion('MAILER_API_KEY_VERSION', {
  secretId: mailerApiKey.id,
  secretString: config.requireSecret('MAILER_API_KEY'),
})
new aws.secretsmanager.SecretVersion('LATITUDE_LLM_AWS_ACCESS_KEY_VERSION', {
  secretId: awsAccessKey.id,
  secretString: config.requireSecret('LATITUDE_LLM_AWS_ACCESS_KEY'),
})
new aws.secretsmanager.SecretVersion('LATITUDE_LLM_AWS_ACCESS_SECRET_VERSION', {
  secretId: awsAccessSecret.id,
  secretString: config.requireSecret('LATITUDE_LLM_AWS_ACCESS_SECRET'),
})

export const mailerApiKeyArn = mailerApiKey.arn
export const sentryDnsArn = sentryDns.arn
export const sentryOrgArn = sentryOrg.arn
export const sentryProjectArn = sentryProject.arn
export const awsAccessKeyArn = awsAccessKey.arn
export const awsAccessSecretArn = awsAccessSecret.arn
