import * as aws from "@pulumi/aws"
import type * as pulumi from "@pulumi/pulumi"
import * as random from "@pulumi/random"
import type { SecretsmanagerSecret, SecretsmanagerSecretVersion } from "./types.ts"

export interface SecretsOutput {
  secrets: Record<string, SecretsmanagerSecret>
  secretVersions: Record<string, SecretsmanagerSecretVersion>
}

function createSingleSecret(
  baseName: string,
  secretName: string,
  description: string,
  value: pulumi.Input<string>,
  environment: string,
  resourceOptions?: {
    readonly secret?: pulumi.CustomResourceOptions
    readonly version?: pulumi.CustomResourceOptions
  },
): {
  secret: SecretsmanagerSecret
  secretVersion: SecretsmanagerSecretVersion
} {
  const secret = new aws.secretsmanager.Secret(
    `${baseName}-${secretName}`,
    {
      name: `${baseName}-${secretName}`,
      description: description,
      tags: {
        Name: `${baseName}-${secretName}`,
        Environment: environment,
      },
    },
    resourceOptions?.secret,
  )

  const secretVersion = new aws.secretsmanager.SecretVersion(
    `${baseName}-${secretName}-version`,
    {
      secretId: secret.id,
      secretString: value,
    },
    resourceOptions?.version,
  )

  return { secret, secretVersion }
}

/** Values are managed in AWS (or via env at first create); avoid Pulumi replacing versions on drift. */
const immutableSecretResourceOptions: {
  secret: pulumi.CustomResourceOptions
  version: pulumi.CustomResourceOptions
} = {
  secret: {
    ignoreChanges: ["recoveryWindowInDays", "forceOverwriteReplicaSecret"],
    protect: true,
  },
  version: {
    ignoreChanges: ["secretString"],
    protect: true,
  },
}

export function createApplicationSecrets(baseName: string, environment: string): SecretsOutput {
  const secrets: Record<string, SecretsmanagerSecret> = {}
  const secretVersions: Record<string, SecretsmanagerSecretVersion> = {}

  const betterAuthSecret = new random.RandomPassword(`${baseName}-better-auth-secret-value`, {
    length: 64,
    special: false,
  })

  const betterAuth = createSingleSecret(
    baseName,
    "better-auth-secret",
    "Better Auth secret key",
    process.env.LAT_BETTER_AUTH_SECRET ?? betterAuthSecret.result,
    environment,
    immutableSecretResourceOptions,
  )
  secrets["better-auth-secret"] = betterAuth.secret
  secretVersions["better-auth-secret"] = betterAuth.secretVersion

  const encryptionKeyValue = new random.RandomPassword(`${baseName}-encryption-key-value`, {
    length: 64,
    special: false,
  })

  const encryptionKey = createSingleSecret(
    baseName,
    "encryption-key",
    "Master encryption key for API keys",
    process.env.LAT_MASTER_ENCRYPTION_KEY ?? encryptionKeyValue.result,
    environment,
    immutableSecretResourceOptions,
  )
  secrets["encryption-key"] = encryptionKey.secret
  secretVersions["encryption-key"] = encryptionKey.secretVersion

  const clickhouseUrl = createSingleSecret(
    baseName,
    "clickhouse-url",
    "ClickHouse Cloud URL",
    process.env.CLICKHOUSE_URL ?? "https://placeholder.clickhouse.cloud:8443",
    environment,
  )
  secrets["clickhouse-url"] = clickhouseUrl.secret
  secretVersions["clickhouse-url"] = clickhouseUrl.secretVersion

  const clickhouseUser = createSingleSecret(
    baseName,
    "clickhouse-user",
    "ClickHouse Cloud username",
    process.env.CLICKHOUSE_USER ?? "default",
    environment,
  )
  secrets["clickhouse-user"] = clickhouseUser.secret
  secretVersions["clickhouse-user"] = clickhouseUser.secretVersion

  const clickhousePassword = createSingleSecret(
    baseName,
    "clickhouse-password",
    "ClickHouse Cloud password",
    process.env.CLICKHOUSE_PASSWORD ?? "placeholder-change-me",
    environment,
  )
  secrets["clickhouse-password"] = clickhousePassword.secret
  secretVersions["clickhouse-password"] = clickhousePassword.secretVersion

  const clickhouseDb = createSingleSecret(
    baseName,
    "clickhouse-db",
    "ClickHouse database name",
    process.env.CLICKHOUSE_DB ?? "latitude",
    environment,
  )
  secrets["clickhouse-db"] = clickhouseDb.secret
  secretVersions["clickhouse-db"] = clickhouseDb.secretVersion

  const clickhouseMigrationUrl = createSingleSecret(
    baseName,
    "clickhouse-migration-url",
    "ClickHouse native protocol URL for migrations",
    process.env.CLICKHOUSE_MIGRATION_URL ?? "clickhouse://localhost:9000",
    environment,
  )
  secrets["clickhouse-migration-url"] = clickhouseMigrationUrl.secret
  secretVersions["clickhouse-migration-url"] = clickhouseMigrationUrl.secretVersion

  const weaviateUrl = createSingleSecret(
    baseName,
    "weaviate-url",
    "Weaviate Cloud URL",
    process.env.LAT_WEAVIATE_URL ?? "https://placeholder.weaviate.cloud",
    environment,
  )
  secrets["weaviate-url"] = weaviateUrl.secret
  secretVersions["weaviate-url"] = weaviateUrl.secretVersion

  const weaviateApiKey = createSingleSecret(
    baseName,
    "weaviate-api-key",
    "Weaviate Cloud API key",
    process.env.LAT_WEAVIATE_API_KEY ?? "placeholder-change-me",
    environment,
  )
  secrets["weaviate-api-key"] = weaviateApiKey.secret
  secretVersions["weaviate-api-key"] = weaviateApiKey.secretVersion

  const mailgunApiKey = createSingleSecret(
    baseName,
    "mailgun-api-key",
    "Mailgun API key",
    process.env.LAT_MAILGUN_API_KEY ?? "placeholder-change-me",
    environment,
  )
  secrets["mailgun-api-key"] = mailgunApiKey.secret
  secretVersions["mailgun-api-key"] = mailgunApiKey.secretVersion

  const mailgunDomain = createSingleSecret(
    baseName,
    "mailgun-domain",
    "Mailgun domain",
    process.env.LAT_MAILGUN_DOMAIN ?? "placeholder-change-me",
    environment,
  )
  secrets["mailgun-domain"] = mailgunDomain.secret
  secretVersions["mailgun-domain"] = mailgunDomain.secretVersion

  const mailgunFrom = createSingleSecret(
    baseName,
    "mailgun-from",
    "Mailgun from email address",
    process.env.LAT_MAILGUN_FROM ?? `noreply@${environment}.latitude.so`,
    environment,
  )
  secrets["mailgun-from"] = mailgunFrom.secret
  secretVersions["mailgun-from"] = mailgunFrom.secretVersion

  const mailgunRegion = createSingleSecret(
    baseName,
    "mailgun-region",
    "Mailgun region",
    process.env.LAT_MAILGUN_REGION ?? "us",
    environment,
  )
  secrets["mailgun-region"] = mailgunRegion.secret
  secretVersions["mailgun-region"] = mailgunRegion.secretVersion

  const googleOauthClientId = createSingleSecret(
    baseName,
    "google-oauth-client-id",
    "Google OAuth client ID — replace placeholder-change-me in Secrets Manager",
    process.env.LAT_GOOGLE_CLIENT_ID ?? "placeholder-change-me",
    environment,
    immutableSecretResourceOptions,
  )
  secrets["google-oauth-client-id"] = googleOauthClientId.secret
  secretVersions["google-oauth-client-id"] = googleOauthClientId.secretVersion

  const googleOauthClientSecret = createSingleSecret(
    baseName,
    "google-oauth-client-secret",
    "Google OAuth client secret — replace placeholder-change-me in Secrets Manager",
    process.env.LAT_GOOGLE_CLIENT_SECRET ?? "placeholder-change-me",
    environment,
    immutableSecretResourceOptions,
  )
  secrets["google-oauth-client-secret"] = googleOauthClientSecret.secret
  secretVersions["google-oauth-client-secret"] = googleOauthClientSecret.secretVersion

  const githubOauthClientId = createSingleSecret(
    baseName,
    "github-oauth-client-id",
    "GitHub OAuth client ID — replace placeholder-change-me in Secrets Manager",
    process.env.LAT_GITHUB_CLIENT_ID ?? "placeholder-change-me",
    environment,
    immutableSecretResourceOptions,
  )
  secrets["github-oauth-client-id"] = githubOauthClientId.secret
  secretVersions["github-oauth-client-id"] = githubOauthClientId.secretVersion

  const githubOauthClientSecret = createSingleSecret(
    baseName,
    "github-oauth-client-secret",
    "GitHub OAuth client secret — replace placeholder-change-me in Secrets Manager",
    process.env.LAT_GITHUB_CLIENT_SECRET ?? "placeholder-change-me",
    environment,
    immutableSecretResourceOptions,
  )
  secrets["github-oauth-client-secret"] = githubOauthClientSecret.secret
  secretVersions["github-oauth-client-secret"] = githubOauthClientSecret.secretVersion

  const temporalApiKey = createSingleSecret(
    baseName,
    "temporal-api-key",
    "Temporal Cloud API key for workflows worker",
    process.env.LAT_TEMPORAL_API_KEY ?? "placeholder-set-before-deploy",
    environment,
  )
  secrets["temporal-api-key"] = temporalApiKey.secret
  secretVersions["temporal-api-key"] = temporalApiKey.secretVersion

  return {
    secrets,
    secretVersions,
  }
}
