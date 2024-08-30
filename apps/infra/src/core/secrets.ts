import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

const cfg = new pulumi.Config()

const mailerApiKey = new aws.secretsmanager.Secret('MAILER_API_KEY', {
  description: 'API key for the mailer service',
  name: 'MAILER_API_KEY',
})

new aws.secretsmanager.SecretVersion('MAILER_API_KEY_VERSION', {
  secretId: mailerApiKey.id,
  secretString: cfg.requireSecret('MAILER_API_KEY'),
})

export const mailerApiKeyArn = mailerApiKey.arn
