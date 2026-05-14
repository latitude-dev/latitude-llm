import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"
import * as random from "@pulumi/random"
import type { EnvironmentConfig } from "../config.ts"
import type {
  Ec2SecurityGroup,
  Ec2Subnet,
  RdsCluster,
  RdsClusterInstance,
  RdsInstance,
  RdsParameterGroup,
  RdsSubnetGroup,
  SecretsmanagerSecret,
  SecretsmanagerSecretVersion,
} from "./types.ts"

export interface RdsOutput {
  subnetGroup: RdsSubnetGroup
  parameterGroup: RdsParameterGroup
  cluster?: RdsCluster
  instance?: RdsClusterInstance
  dbInstance?: RdsInstance
  secret: SecretsmanagerSecret
  secretVersion: SecretsmanagerSecretVersion
  adminSecret: SecretsmanagerSecret
  adminSecretVersion: SecretsmanagerSecretVersion
  connectionInfo: pulumi.Output<{
    host: string
    port: number
    database: string
    username: string
  }>
}

export function createRds(
  name: string,
  config: EnvironmentConfig,
  privateSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
): RdsOutput {
  const masterUsername = "latitude"
  const databaseName = "latitude"

  const subnetGroup = new aws.rds.SubnetGroup(`${name}-rds-subnet-group`, {
    subnetIds: privateSubnets.map((s) => s.id),
    tags: {
      Name: `${name}-rds-subnet-group`,
      Environment: config.name,
    },
  })

  const secret = new aws.secretsmanager.Secret(`${name}-db-secret`, {
    name: `${name}-database-credentials`,
    description: "Database credentials for Latitude app user",
    tags: {
      Name: `${name}-db-secret`,
      Environment: config.name,
    },
  })

  const password = new random.RandomPassword(`${name}-db-password`, {
    length: 32,
    special: false,
  }).result

  if (config.rds.type === "aurora-serverless") {
    return createAuroraServerless(
      name,
      config,
      subnetGroup,
      securityGroup,
      secret,
      password,
      masterUsername,
      databaseName,
    )
  } else {
    return createStandardInstance(
      name,
      config,
      subnetGroup,
      securityGroup,
      secret,
      password,
      masterUsername,
      databaseName,
    )
  }
}

function createAuroraServerless(
  name: string,
  config: EnvironmentConfig,
  subnetGroup: RdsSubnetGroup,
  securityGroup: Ec2SecurityGroup,
  secret: SecretsmanagerSecret,
  password: pulumi.Output<string>,
  username: string,
  databaseName: string,
): RdsOutput {
  const auroraPostgresVersion = "16.11"
  const isProduction = config.name === "production"

  const parameterGroup = new aws.rds.ParameterGroup(`${name}-rds-params`, {
    family: "aurora-postgresql16",
    description: "Custom parameter group for Latitude",
    parameters: [
      {
        name: "log_min_duration_statement",
        value: "1000",
      },
    ],
    tags: {
      Name: `${name}-rds-params`,
      Environment: config.name,
    },
  })

  const cluster = new aws.rds.Cluster(`${name}-aurora`, {
    clusterIdentifier: `${name}-aurora`,
    engine: "aurora-postgresql",
    engineVersion: auroraPostgresVersion,
    databaseName: databaseName,
    masterUsername: username,
    masterPassword: password,
    dbSubnetGroupName: subnetGroup.name,
    vpcSecurityGroupIds: [securityGroup.id],
    skipFinalSnapshot: config.name === "staging",
    finalSnapshotIdentifier: isProduction ? `${name}-encrypted-final-snapshot` : undefined,
    serverlessv2ScalingConfiguration: {
      minCapacity: config.rds.minAcu!,
      maxCapacity: config.rds.maxAcu!,
    },
    backupRetentionPeriod: config.rds.backupDays,
    storageEncrypted: true,
    preferredBackupWindow: "03:00-04:00",
    enabledCloudwatchLogsExports: ["postgresql"],
    tags: {
      Name: `${name}-aurora`,
      Environment: config.name,
    },
  }, {
    aliases: isProduction ? [{ name: `${name}-aurora-encrypted-migration` }] : undefined,
    protect: isProduction,
  })

  const instance = new aws.rds.ClusterInstance(`${name}-aurora-instance`, {
    identifier: `${name}-aurora-instance`,
    clusterIdentifier: cluster.id,
    instanceClass: "db.serverless",
    engine: "aurora-postgresql",
    engineVersion: auroraPostgresVersion,
    tags: {
      Name: `${name}-aurora-instance`,
      Environment: config.name,
    },
  }, {
    aliases: isProduction ? [{ name: `${name}-aurora-encrypted-migration-instance` }] : undefined,
    protect: isProduction,
  })

  const adminSecret = new aws.secretsmanager.Secret(`${name}-admin-db-secret`, {
    name: `${name}-admin-database-url`,
    description: "Admin database URL for migrations",
    tags: {
      Name: `${name}-admin-db-secret`,
      Environment: config.name,
    },
  })

  const updateDatabaseUrlHost = (databaseUrl: pulumi.Output<string>, host: pulumi.Output<string>) =>
    pulumi.all([databaseUrl, host]).apply(([value, targetHost]) => {
      const url = new URL(value)
      url.hostname = targetHost
      url.port = "5432"
      return url.toString()
    })

  const existingAppSecretVersion = isProduction
    ? aws.secretsmanager.getSecretVersionOutput({ secretId: secret.id })
    : undefined

  const existingAdminSecretVersion = isProduction
    ? aws.secretsmanager.getSecretVersionOutput({ secretId: adminSecret.id })
    : undefined

  const appSecretString = existingAppSecretVersion?.secretString
    ? updateDatabaseUrlHost(existingAppSecretVersion.secretString, cluster.endpoint)
    : pulumi.interpolate`postgres://${username}:${password}@${cluster.endpoint}:5432/${databaseName}`

  const adminSecretString = existingAdminSecretVersion?.secretString
    ? updateDatabaseUrlHost(existingAdminSecretVersion.secretString, cluster.endpoint)
    : pulumi.interpolate`postgres://${username}:${password}@${cluster.endpoint}:5432/${databaseName}`

  const secretVersion = new aws.secretsmanager.SecretVersion(`${name}-db-secret-version`, {
    secretId: secret.id,
    secretString: appSecretString,
  })

  const adminSecretVersion = new aws.secretsmanager.SecretVersion(`${name}-admin-db-secret-version`, {
    secretId: adminSecret.id,
    secretString: adminSecretString,
  })

  const connectionInfo = pulumi.output({
    host: cluster.endpoint,
    port: 5432,
    database: databaseName,
    username: username,
  })

  return {
    subnetGroup,
    parameterGroup,
    cluster,
    instance,
    secret,
    secretVersion,
    adminSecret,
    adminSecretVersion,
    connectionInfo,
  }
}

function createStandardInstance(
  name: string,
  config: EnvironmentConfig,
  subnetGroup: RdsSubnetGroup,
  securityGroup: Ec2SecurityGroup,
  secret: SecretsmanagerSecret,
  password: pulumi.Output<string>,
  username: string,
  databaseName: string,
): RdsOutput {
  const parameterGroup = new aws.rds.ParameterGroup(`${name}-rds-params`, {
    family: "postgres16",
    description: "Custom parameter group for Latitude",
    parameters: [
      {
        name: "log_min_duration_statement",
        value: "1000",
      },
    ],
    tags: {
      Name: `${name}-rds-params`,
      Environment: config.name,
    },
  })

  const dbInstance = new aws.rds.Instance(`${name}-postgres`, {
    identifier: `${name}-postgres`,
    engine: "postgres",
    engineVersion: "16.6",
    instanceClass: config.rds.instanceType!,
    allocatedStorage: 20,
    maxAllocatedStorage: 100,
    storageType: "gp3",
    storageEncrypted: true,
    dbName: databaseName,
    username: username,
    password: password,
    dbSubnetGroupName: subnetGroup.name,
    vpcSecurityGroupIds: [securityGroup.id],
    multiAz: config.rds.multiAz,
    backupRetentionPeriod: config.rds.backupDays,
    skipFinalSnapshot: config.name === "staging",
    finalSnapshotIdentifier: config.name === "production" ? `${name}-final-snapshot` : undefined,
    enabledCloudwatchLogsExports: ["postgresql"],
    parameterGroupName: parameterGroup.name,
    tags: {
      Name: `${name}-postgres`,
      Environment: config.name,
    },
  })

  const secretVersion = new aws.secretsmanager.SecretVersion(`${name}-db-secret-version`, {
    secretId: secret.id,
    secretString: pulumi.interpolate`postgres://${username}:${password}@${dbInstance.address}:5432/${databaseName}?uselibpqcompat=true&sslmode=require`,
  })

  const adminSecret = new aws.secretsmanager.Secret(`${name}-admin-db-secret`, {
    name: `${name}-admin-database-url`,
    description: "Admin database URL for migrations",
    tags: {
      Name: `${name}-admin-db-secret`,
      Environment: config.name,
    },
  })

  const adminSecretVersion = new aws.secretsmanager.SecretVersion(`${name}-admin-db-secret-version`, {
    secretId: adminSecret.id,
    secretString: pulumi.interpolate`postgres://${username}:${password}@${dbInstance.address}:5432/${databaseName}?uselibpqcompat=true&sslmode=require`,
  })

  const connectionInfo = pulumi.output({
    host: dbInstance.address,
    port: 5432,
    database: databaseName,
    username: username,
  })

  return {
    subnetGroup,
    parameterGroup,
    dbInstance,
    secret,
    secretVersion,
    adminSecret,
    adminSecretVersion,
    connectionInfo,
  }
}
