import * as aws from "@pulumi/aws"
import type { Output } from "@pulumi/pulumi"
import * as pulumi from "@pulumi/pulumi"
import type { EnvironmentConfig, ServiceConfig } from "../config.ts"
import type {
  CloudwatchLogGroup,
  Ec2SecurityGroup,
  Ec2Subnet,
  EcsCluster,
  EcsService,
  EcsTaskDefinition,
  IamRole,
  S3Bucket,
  SecretsmanagerSecret,
} from "./types.ts"

export interface TemporalCloudConfig {
  readonly address: string
  readonly namespace: string
  readonly taskQueue: string
}

export interface EcsOutput {
  cluster: EcsCluster
  logGroups: Record<string, CloudwatchLogGroup>
  executionRole: IamRole
  taskRole: IamRole
  taskDefinitions: Record<string, EcsTaskDefinition>
  migrationTaskDefinition: EcsTaskDefinition
  services: Record<string, EcsService>
}

export function createEcs(
  name: string,
  config: EnvironmentConfig,
  privateSubnets: Ec2Subnet[],
  publicSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
  secrets: Record<string, SecretsmanagerSecret>,
  rdsSecret: SecretsmanagerSecret,
  rdsAdminSecret: SecretsmanagerSecret,
  cacheRedisHost: Output<string>,
  bullmqRedisHost: Output<string>,
  s3Bucket: S3Bucket,
  imageTag: pulumi.Input<string>,
  albTargetGroupArns: Record<string, Output<string>>,
  temporalCloud: TemporalCloudConfig,
): EcsOutput {
  const cluster = new aws.ecs.Cluster(`${name}-cluster`, {
    name: `${name}-cluster`,
    settings: [
      {
        name: "containerInsights",
        value: "enabled",
      },
    ],
    tags: {
      Name: `${name}-cluster`,
      Environment: config.name,
    },
  })

  const logGroups: Record<string, CloudwatchLogGroup> = {}
  for (const service of config.ecs.services) {
    logGroups[service.name] = new aws.cloudwatch.LogGroup(`${name}-${service.name}-logs`, {
      name: `/ecs/${name}/${service.name}`,
      retentionInDays: config.name === "staging" ? 7 : 30,
      tags: {
        Name: `${name}-${service.name}-logs`,
        Environment: config.name,
      },
    })
  }

  const executionRole = new aws.iam.Role(`${name}-execution-role`, {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "ecs-tasks.amazonaws.com",
          },
        },
      ],
    }),
    tags: {
      Name: `${name}-execution-role`,
      Environment: config.name,
    },
  })

  new aws.iam.RolePolicyAttachment(`${name}-execution-policy`, {
    role: executionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  })

  new aws.iam.RolePolicy(`${name}-secrets-policy`, {
    role: executionRole.name,
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
          Resource: [...Object.values(secrets).map((s) => s.arn), rdsSecret.arn, rdsAdminSecret.arn],
        },
      ],
    },
  })

  const taskRole = new aws.iam.Role(`${name}-task-role`, {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "ecs-tasks.amazonaws.com",
          },
        },
      ],
    }),
    tags: {
      Name: `${name}-task-role`,
      Environment: config.name,
    },
  })

  new aws.iam.RolePolicy(`${name}-s3-policy`, {
    role: taskRole.name,
    policy: pulumi.interpolate`{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
        "Resource": ["${s3Bucket.arn}", "${s3Bucket.arn}/*"]
      }]
    }`,
  })

  const taskDefinitions: Record<string, EcsTaskDefinition> = {}
  const services: Record<string, EcsService> = {}

  for (const serviceConfig of config.ecs.services) {
    const taskDef = createTaskDefinition(
      name,
      config,
      serviceConfig,
      executionRole,
      taskRole,
      logGroups[serviceConfig.name],
      secrets,
      rdsSecret,
      rdsAdminSecret,
      cacheRedisHost,
      bullmqRedisHost,
      imageTag,
      temporalCloud,
    )
    taskDefinitions[serviceConfig.name] = taskDef

    const ecsService = new aws.ecs.Service(`${name}-${serviceConfig.name}`, {
      cluster: cluster.arn,
      taskDefinition: taskDef.arn,
      desiredCount: serviceConfig.desiredCount,
      launchType: "FARGATE",
      networkConfiguration: {
        subnets: privateSubnets.map((s) => s.id),
        securityGroups: [securityGroup.id],
        assignPublicIp: false,
      },
      loadBalancers:
        ["web", "api", "ingest"].includes(serviceConfig.name) &&
        albTargetGroupArns[serviceConfig.name] &&
        serviceConfig.port
          ? [
              {
                targetGroupArn: albTargetGroupArns[serviceConfig.name],
                containerName: serviceConfig.name,
                containerPort: serviceConfig.port,
              },
            ]
          : undefined,
      deploymentController: {
        type: "ECS",
      },
      tags: {
        Name: `${name}-${serviceConfig.name}`,
        Environment: config.name,
      },
    })
    services[serviceConfig.name] = ecsService

    if (config.name === "production" && serviceConfig.maxCount > serviceConfig.minCount) {
      const target = new aws.appautoscaling.Target(`${name}-${serviceConfig.name}-scaling-target`, {
        maxCapacity: serviceConfig.maxCount,
        minCapacity: serviceConfig.minCount,
        resourceId: pulumi.interpolate`service/${cluster.name}/${ecsService.name}`,
        scalableDimension: "ecs:service:DesiredCount",
        serviceNamespace: "ecs",
      })

      new aws.appautoscaling.Policy(`${name}-${serviceConfig.name}-cpu-scaling`, {
        policyType: "TargetTrackingScaling",
        resourceId: target.resourceId,
        scalableDimension: target.scalableDimension,
        serviceNamespace: target.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: "ECSServiceAverageCPUUtilization",
          },
          targetValue: 70,
          scaleInCooldown: 60,
          scaleOutCooldown: 60,
        },
      })
    }
  }

  const migrationsLogGroup = new aws.cloudwatch.LogGroup(`${name}-migrations-logs`, {
    name: `/ecs/${name}/migrations`,
    retentionInDays: config.name === "staging" ? 7 : 30,
    tags: {
      Name: `${name}-migrations-logs`,
      Environment: config.name,
    },
  })

  const migrationTaskDef = createMigrationTaskDefinition(
    name,
    config,
    executionRole,
    taskRole,
    migrationsLogGroup,
    rdsAdminSecret,
    secrets,
    imageTag,
  )

  return {
    cluster,
    logGroups,
    executionRole,
    taskRole,
    taskDefinitions,
    migrationTaskDefinition: migrationTaskDef,
    services,
  }
}

function createTaskDefinition(
  name: string,
  config: EnvironmentConfig,
  serviceConfig: ServiceConfig,
  executionRole: IamRole,
  taskRole: IamRole,
  logGroup: CloudwatchLogGroup,
  secrets: Record<string, SecretsmanagerSecret>,
  rdsSecret: SecretsmanagerSecret,
  rdsAdminSecret: SecretsmanagerSecret,
  cacheRedisHost: Output<string>,
  bullmqRedisHost: Output<string>,
  imageTag: pulumi.Input<string>,
  temporalCloud: TemporalCloudConfig,
): EcsTaskDefinition {
  const owner = process.env.GHCR_OWNER ?? "latitude-dev"

  const protocol = "https"
  const webUrl = `${protocol}://${config.domains.web}`
  const apiUrl = `${protocol}://${config.domains.api}`
  const ingestUrl = `${protocol}://${config.domains.ingest}`
  const trustedOrigins = `${webUrl},${apiUrl}`

  const containerDefinitions = pulumi
    .all([
      logGroup.name,
      cacheRedisHost,
      bullmqRedisHost,
      imageTag,
      rdsSecret.arn,
      rdsAdminSecret.arn,
      secrets["better-auth-secret"].arn,
      secrets["encryption-key"].arn,
      secrets["clickhouse-url"].arn,
      secrets["clickhouse-user"].arn,
      secrets["clickhouse-password"].arn,
      secrets["clickhouse-db"].arn,
      secrets["weaviate-url"].arn,
      secrets["weaviate-api-key"].arn,
      secrets["mailgun-api-key"].arn,
      secrets["mailgun-domain"].arn,
      secrets["mailgun-from"].arn,
      secrets["mailgun-region"].arn,
      secrets["google-oauth-client-id"].arn,
      secrets["google-oauth-client-secret"].arn,
      secrets["github-oauth-client-id"].arn,
      secrets["github-oauth-client-secret"].arn,
      secrets["temporal-api-key"].arn,
      secrets["datadog-api-key"].arn,
      secrets["datadog-site"].arn,
    ])
    .apply(
      ([
        logGroupName,
        cacheRedis,
        bullmqRedis,
        tag,
        dbSecretArn,
        dbAdminSecretArn,
        betterAuthArn,
        encryptionKeyArn,
        clickhouseUrlArn,
        clickhouseUserArn,
        clickhousePasswordArn,
        clickhouseDbArn,
        weaviateUrlArn,
        weaviateApiKeyArn,
        mailgunApiKeyArn,
        mailgunDomainArn,
        mailgunFromArn,
        mailgunRegionArn,
        googleOauthClientIdArn,
        googleOauthClientSecretArn,
        githubOauthClientIdArn,
        githubOauthClientSecretArn,
        temporalApiKeyArn,
        datadogApiKeyArn,
        datadogSiteArn,
      ]) => {
        const baseEnvironment: { name: string; value: string }[] = [
          { name: "NODE_ENV", value: config.name === "production" ? "production" : "staging" },
          { name: "PORT", value: "8080" },
          { name: "LAT_WEB_PORT", value: "8080" },
          { name: "LAT_API_PORT", value: "8080" },
          { name: "LAT_INGEST_PORT", value: "8080" },
          { name: "LAT_WORKERS_HEALTH_PORT", value: "8080" },
          { name: "LAT_REDIS_HOST", value: cacheRedis },
          { name: "LAT_REDIS_PORT", value: "6379" },
          { name: "LAT_BULLMQ_HOST", value: bullmqRedis },
          { name: "LAT_BULLMQ_PORT", value: "6379" },
          { name: "LAT_STORAGE_DRIVER", value: "s3" },
          { name: "LAT_STORAGE_S3_BUCKET", value: config.s3.bucketName },
          { name: "LAT_STORAGE_S3_REGION", value: config.region },
          { name: "LAT_PG_POOL_MAX", value: "20" },
          { name: "LAT_PG_IDLE_TIMEOUT_MS", value: "30000" },
          { name: "LAT_PG_CONNECT_TIMEOUT_MS", value: "10000" },
          { name: "LAT_WEB_URL", value: webUrl },
          { name: "LAT_API_URL", value: apiUrl },
          { name: "LAT_INGEST_URL", value: ingestUrl },
          { name: "LAT_BETTER_AUTH_URL", value: apiUrl },
          { name: "LAT_TRUSTED_ORIGINS", value: trustedOrigins },
          { name: "LAT_CORS_ALLOWED_ORIGINS", value: webUrl },
          { name: "VITE_LAT_API_URL", value: `${apiUrl}/v1` },
          { name: "VITE_LAT_WEB_URL", value: webUrl },
        ]

        const baseSecrets: { name: string; valueFrom: string }[] = [
          { name: "LAT_DATABASE_URL", valueFrom: dbSecretArn },
          { name: "LAT_ADMIN_DATABASE_URL", valueFrom: dbAdminSecretArn },
          { name: "LAT_BETTER_AUTH_SECRET", valueFrom: betterAuthArn },
          { name: "LAT_MASTER_ENCRYPTION_KEY", valueFrom: encryptionKeyArn },
          { name: "CLICKHOUSE_URL", valueFrom: clickhouseUrlArn },
          { name: "CLICKHOUSE_USER", valueFrom: clickhouseUserArn },
          { name: "CLICKHOUSE_PASSWORD", valueFrom: clickhousePasswordArn },
          { name: "CLICKHOUSE_DB", valueFrom: clickhouseDbArn },
          { name: "LAT_WEAVIATE_URL", valueFrom: weaviateUrlArn },
          { name: "LAT_WEAVIATE_API_KEY", valueFrom: weaviateApiKeyArn },
          { name: "LAT_MAILGUN_API_KEY", valueFrom: mailgunApiKeyArn },
          { name: "LAT_MAILGUN_DOMAIN", valueFrom: mailgunDomainArn },
          { name: "LAT_MAILGUN_FROM", valueFrom: mailgunFromArn },
          { name: "LAT_MAILGUN_REGION", valueFrom: mailgunRegionArn },
          { name: "LAT_DATADOG_API_KEY", valueFrom: datadogApiKeyArn },
          { name: "LAT_DATADOG_SITE", valueFrom: datadogSiteArn },
        ]

        // Service-specific environment variables
        const temporalEnvVars = [
          { name: "LAT_TEMPORAL_ADDRESS", value: temporalCloud.address },
          { name: "LAT_TEMPORAL_NAMESPACE", value: temporalCloud.namespace },
          { name: "LAT_TEMPORAL_TASK_QUEUE", value: temporalCloud.taskQueue },
        ]

        const serviceSpecificEnvVars: Record<string, { name: string; value: string }[]> = {
          workflows: [{ name: "LAT_WORKFLOWS_HEALTH_PORT", value: "8080" }, ...temporalEnvVars],
          workers: temporalEnvVars,
        }

        const environment = [...baseEnvironment, ...(serviceSpecificEnvVars[serviceConfig.name] ?? [])]

        // Service-specific secrets
        const oauthSecrets = [
          { name: "LAT_GOOGLE_CLIENT_ID", valueFrom: googleOauthClientIdArn },
          { name: "LAT_GOOGLE_CLIENT_SECRET", valueFrom: googleOauthClientSecretArn },
          { name: "LAT_GITHUB_CLIENT_ID", valueFrom: githubOauthClientIdArn },
          { name: "LAT_GITHUB_CLIENT_SECRET", valueFrom: githubOauthClientSecretArn },
        ]

        const temporalSecret = { name: "LAT_TEMPORAL_API_KEY", valueFrom: temporalApiKeyArn }

        const serviceSpecificSecrets: Record<string, { name: string; valueFrom: string }[]> = {
          web: oauthSecrets,
          workflows: [temporalSecret],
          workers: [temporalSecret],
        }

        const secrets = [...baseSecrets, ...(serviceSpecificSecrets[serviceConfig.name] ?? [])]

        const def = {
          name: serviceConfig.name,
          image: `ghcr.io/${owner}/latitude-${config.name}-${serviceConfig.name}:${tag}`,
          cpu: serviceConfig.cpu,
          memory: serviceConfig.memory,
          essential: true,
          portMappings:
            serviceConfig.port !== undefined
              ? [
                  {
                    containerPort: serviceConfig.port,
                    protocol: "tcp",
                  },
                ]
              : undefined,
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logGroupName,
              "awslogs-region": config.region,
              "awslogs-stream-prefix": serviceConfig.name,
            },
          },
          environment,
          secrets,
          healthCheck: {
            command: [
              "CMD-SHELL",
              `curl -f http://localhost:${serviceConfig.port ?? 8080}${serviceConfig.healthCheckPath} || exit 1`,
            ],
            interval: 30,
            timeout: 5,
            retries: 3,
            startPeriod: 60,
          },
        }
        return JSON.stringify([def])
      },
    )

  return new aws.ecs.TaskDefinition(`${name}-${serviceConfig.name}-task`, {
    family: `${name}-${serviceConfig.name}`,
    cpu: serviceConfig.cpu.toString(),
    memory: serviceConfig.memory.toString(),
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: containerDefinitions,
    tags: {
      Name: `${name}-${serviceConfig.name}-task`,
      Environment: config.name,
    },
  })
}

function createMigrationTaskDefinition(
  name: string,
  config: EnvironmentConfig,
  executionRole: IamRole,
  taskRole: IamRole,
  logGroup: CloudwatchLogGroup,
  rdsAdminSecret: SecretsmanagerSecret,
  secrets: Record<string, SecretsmanagerSecret>,
  imageTag: pulumi.Input<string>,
): EcsTaskDefinition {
  const owner = process.env.GHCR_OWNER ?? "latitude-dev"
  const taskFamily = `${name}-migrations`

  const containerDefinitions = pulumi
    .all([
      logGroup.name,
      imageTag,
      rdsAdminSecret.arn,
      secrets["clickhouse-migration-url"].arn,
      secrets["clickhouse-user"].arn,
      secrets["clickhouse-password"].arn,
      secrets["clickhouse-db"].arn,
      secrets["weaviate-url"].arn,
      secrets["weaviate-api-key"].arn,
    ])
    .apply(
      ([
        logGroupName,
        tag,
        dbSecretArn,
        clickhouseMigrationUrlArn,
        clickhouseUserArn,
        clickhousePasswordArn,
        clickhouseDbArn,
        weaviateUrlArn,
        weaviateApiKeyArn,
      ]) => {
        const def = {
          name: "migrations",
          image: `ghcr.io/${owner}/latitude-${config.name}-migrations:${tag}`,
          cpu: 256,
          memory: 512,
          essential: true,
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logGroupName,
              "awslogs-region": config.region,
              "awslogs-stream-prefix": "migrations",
            },
          },
          environment: [{ name: "NODE_ENV", value: config.name === "production" ? "production" : "staging" }],
          secrets: [
            { name: "LAT_ADMIN_DATABASE_URL", valueFrom: dbSecretArn },
            { name: "CLICKHOUSE_MIGRATION_URL", valueFrom: clickhouseMigrationUrlArn },
            { name: "CLICKHOUSE_USER", valueFrom: clickhouseUserArn },
            { name: "CLICKHOUSE_PASSWORD", valueFrom: clickhousePasswordArn },
            { name: "CLICKHOUSE_DB", valueFrom: clickhouseDbArn },
            { name: "LAT_WEAVIATE_URL", valueFrom: weaviateUrlArn },
            { name: "LAT_WEAVIATE_API_KEY", valueFrom: weaviateApiKeyArn },
          ],
        }
        return JSON.stringify([def])
      },
    )

  return new aws.ecs.TaskDefinition(`${taskFamily}-task`, {
    family: taskFamily,
    cpu: "256",
    memory: "512",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: containerDefinitions,
    tags: {
      Name: `${taskFamily}-task`,
      Environment: config.name,
    },
  })
}
