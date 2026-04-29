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

  // Log group for datadog-agent sidecar
  const datadogLogGroup = new aws.cloudwatch.LogGroup(`${name}-datadog-agent-logs`, {
    name: `/ecs/${name}/datadog-agent`,
    retentionInDays: config.name === "staging" ? 7 : 30,
    tags: {
      Name: `${name}-datadog-agent-logs`,
      Environment: config.name,
    },
  })

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

  // Cross-region inference profiles (e.g. eu.amazon.nova-2-lite-v1:0) and direct foundation
  // model IDs both require InvokeModel on inference-profile and foundation-model ARNs.
  // Read actions are required for inference profile discovery per AWS Bedrock docs.
  // @see https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html
  new aws.iam.RolePolicy(`${name}-bedrock-policy`, {
    role: taskRole.name,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
          Resource: [
            "arn:aws:bedrock:*::foundation-model/*",
            "arn:aws:bedrock:*:*:inference-profile/*",
            "arn:aws:bedrock:*:*:application-inference-profile/*",
          ],
        },
        {
          Effect: "Allow",
          Action: ["bedrock:GetInferenceProfile", "bedrock:ListInferenceProfiles"],
          Resource: ["arn:aws:bedrock:*:*:inference-profile/*", "arn:aws:bedrock:*:*:application-inference-profile/*"],
        },
      ],
    }),
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
      s3Bucket,
      imageTag,
      temporalCloud,
    )
    taskDefinitions[serviceConfig.name] = taskDef

    const ecsService = new aws.ecs.Service(
      `${name}-${serviceConfig.name}`,
      {
        cluster: cluster.arn,
        taskDefinition: taskDef.arn,
        desiredCount: serviceConfig.desiredCount,
        launchType: "FARGATE",
        networkConfiguration: {
          subnets: privateSubnets.map((s) => s.id),
          securityGroups: [securityGroup.id],
          assignPublicIp: false,
        },
        loadBalancers: serviceConfig.port
          ? Object.entries(albTargetGroupArns)
              .filter(([key]) => {
                if (serviceConfig.name === "workers") return key === "bullBoard"
                return key === serviceConfig.name
              })
              .map(([_, arn]) => ({
                targetGroupArn: arn,
                containerName: serviceConfig.name,
                containerPort: serviceConfig.port!,
              }))
          : undefined,
        deploymentController: {
          type: "ECS",
        },
        tags: {
          Name: `${name}-${serviceConfig.name}`,
          Environment: config.name,
        },
      },
      // CD registers new task definition revisions on every deploy. Without
      // this, `pulumi refresh` pulls the live revision into state and the next
      // `pulumi up` rolls services back to the revision Pulumi last created.
      { ignoreChanges: ["taskDefinition"] },
    )
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
  s3Bucket: S3Bucket,
  imageTag: pulumi.Input<string>,
  temporalCloud: TemporalCloudConfig,
): EcsTaskDefinition {
  const owner = process.env.GHCR_OWNER ?? "latitude-dev"

  // Resource allocation for Datadog Agent sidecar container
  const DATADOG_AGENT_CPU = 256
  const DATADOG_AGENT_MEMORY = 512

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
      secrets["voyage-api-key"].arn,
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
      secrets["latitude-telemetry-api-key"].arn,
      secrets["latitude-telemetry-project-slug"].arn,
      secrets["turnstile-secret-key"].arn,
      secrets["posthog-api-key"].arn,
      secrets["bull-board-username"].arn,
      secrets["bull-board-password"].arn,
      s3Bucket.id,
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
        voyageApiKeyArn,
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
        latitudeTelemetryApiKeyArn,
        latitudeTelemetryProjectSlugArn,
        turnstileSecretKeyArn,
        posthogApiKeyArn,
        bullBoardUsernameArn,
        bullBoardPasswordArn,
        s3BucketName,
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
          {
            name: "LAT_REDIS_TLS",
            value: config.redis.cache.type === "memorydb" || config.redis.bullmq.type === "memorydb" ? "true" : "false",
          },
          { name: "LAT_REDIS_CLUSTER", value: config.redis.cache.type === "memorydb" ? "true" : "false" },
          { name: "LAT_BULLMQ_HOST", value: bullmqRedis },
          { name: "LAT_BULLMQ_PORT", value: "6379" },
          { name: "LAT_BULLMQ_CLUSTER", value: config.redis.bullmq.type === "memorydb" ? "true" : "false" },
          { name: "LAT_STORAGE_DRIVER", value: "s3" },
          { name: "LAT_STORAGE_S3_BUCKET", value: s3BucketName },
          { name: "LAT_STORAGE_S3_REGION", value: config.region },
          { name: "LAT_PG_POOL_MAX", value: "20" },
          { name: "LAT_PG_IDLE_TIMEOUT_MS", value: "30000" },
          { name: "LAT_PG_CONNECT_TIMEOUT_MS", value: "10000" },
          { name: "LAT_WEB_URL", value: webUrl },
          { name: "LAT_API_URL", value: apiUrl },
          { name: "LAT_INGEST_URL", value: ingestUrl },
          { name: "LAT_LATITUDE_TELEMETRY_INGEST_URL", value: ingestUrl },
          { name: "LAT_LATITUDE_API_URL", value: apiUrl },
          { name: "LAT_BETTER_AUTH_URL", value: apiUrl },
          { name: "LAT_TRUSTED_ORIGINS", value: trustedOrigins },
          { name: "LAT_CORS_ALLOWED_ORIGINS", value: webUrl },
          { name: "VITE_LAT_API_URL", value: `${apiUrl}/v1` },
          { name: "VITE_LAT_WEB_URL", value: webUrl },
          ...(config.name === "production" ? [{ name: "VITE_LAT_GTM_CONTAINER_ID", value: "GTM-5NWGV24H" }] : []),
          { name: "DD_TRACE_ENABLED", value: "true" },
          { name: "DD_ENV", value: config.name },
          { name: "DD_SERVICE", value: serviceConfig.name },
          { name: "LAT_OBSERVABILITY_ENVIRONMENT", value: config.name },
          { name: "DD_DOGSTATSD_HOST", value: "localhost" },
          { name: "DD_DOGSTATSD_PORT", value: "8125" },
          { name: "DD_AGENT_HOST", value: "localhost" },
          { name: "LAT_OBSERVABILITY_ENABLED", value: "true" },
          { name: "LAT_OBSERVABILITY_OTLP_TRACES_ENDPOINT", value: "http://localhost:4318/v1/traces" },
          { name: "LAT_POSTHOG_HOST", value: "https://eu.i.posthog.com" },
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
          { name: "LAT_VOYAGE_API_KEY", valueFrom: voyageApiKeyArn },
          { name: "LAT_MAILGUN_API_KEY", valueFrom: mailgunApiKeyArn },
          { name: "LAT_MAILGUN_DOMAIN", valueFrom: mailgunDomainArn },
          { name: "LAT_MAILGUN_FROM", valueFrom: mailgunFromArn },
          { name: "LAT_MAILGUN_REGION", valueFrom: mailgunRegionArn },
          // TODO(observability): enable when we want to start tracing Latitude with Latitude
          // { name: "LAT_LATITUDE_TELEMETRY_API_KEY", valueFrom: latitudeTelemetryApiKeyArn },
          // { name: "LAT_LATITUDE_TELEMETRY_PROJECT_SLUG", valueFrom: latitudeTelemetryProjectSlugArn },
          { name: "LAT_TURNSTILE_SECRET_KEY", valueFrom: turnstileSecretKeyArn },
          { name: "LAT_POSTHOG_API_KEY", valueFrom: posthogApiKeyArn },
        ]

        // Service-specific environment variables
        const temporalEnvVars = [
          { name: "LAT_TEMPORAL_ADDRESS", value: temporalCloud.address },
          { name: "LAT_TEMPORAL_NAMESPACE", value: temporalCloud.namespace },
          { name: "LAT_TEMPORAL_TASK_QUEUE", value: temporalCloud.taskQueue },
        ]

        // Temporal's worker runs webpack to bundle workflows at startup; V8's default
        // container-derived heap (~half of this task's container memory) is too small and OOMs.
        const workflowsMaxOldSpaceMb = Math.max(384, Math.floor(serviceConfig.memory * 0.7))

        const serviceSpecificEnvVars: Record<string, { name: string; value: string }[]> = {
          // The web app starts workflows from server functions (e.g. issue monitoring).
          web: temporalEnvVars,
          workflows: [
            { name: "LAT_WORKFLOWS_HEALTH_PORT", value: "8080" },
            { name: "NODE_OPTIONS", value: `--max-old-space-size=${workflowsMaxOldSpaceMb}` },
            ...temporalEnvVars,
          ],
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

        const bullBoardSecrets = [
          { name: "LAT_BULL_BOARD_USERNAME", valueFrom: bullBoardUsernameArn },
          { name: "LAT_BULL_BOARD_PASSWORD", valueFrom: bullBoardPasswordArn },
        ]

        const serviceSpecificSecrets: Record<string, { name: string; valueFrom: string }[]> = {
          web: [...oauthSecrets, temporalSecret],
          workflows: [temporalSecret],
          workers: [temporalSecret, ...bullBoardSecrets],
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
          dependsOn: [
            {
              containerName: "datadog-agent",
              condition: "START",
            },
          ],
        }

        const datadogAgentDef = {
          name: "datadog-agent",
          image: "public.ecr.aws/datadog/agent:latest",
          essential: false,
          cpu: DATADOG_AGENT_CPU,
          memory: DATADOG_AGENT_MEMORY,
          portMappings: [
            {
              containerPort: 8125,
              protocol: "udp",
            },
            {
              containerPort: 8126,
              protocol: "tcp",
            },
            {
              containerPort: 4318,
              protocol: "tcp",
            },
            {
              containerPort: 4317,
              protocol: "tcp",
            },
          ],
          environment: [
            { name: "DD_APM_ENABLED", value: "true" },
            { name: "DD_APM_RECEIVER_PORT", value: "8126" },
            { name: "DD_DOGSTATSD_NON_LOCAL_TRAFFIC", value: "true" },
            { name: "DD_DOGSTATSD_PORT", value: "8125" },
            { name: "DD_ECS_TASK_COLLECTION_ENABLED", value: "true" },
            { name: "DD_CONTAINER_EXCLUDE", value: "name:datadog-agent" },
            { name: "DD_ENV", value: config.name },
            { name: "DD_SERVICE", value: serviceConfig.name },
            { name: "ECS_FARGATE", value: "true" },
            { name: "DD_OTLP_CONFIG_TRACES_ENABLED", value: "true" },
            { name: "DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT", value: "0.0.0.0:4318" },
            { name: "DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_GRPC_ENDPOINT", value: "0.0.0.0:4317" },
            { name: "DD_LOG_LEVEL", value: "debug" },
          ],
          secrets: [
            { name: "DD_API_KEY", valueFrom: datadogApiKeyArn },
            { name: "DD_SITE", valueFrom: datadogSiteArn },
          ],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": `/ecs/${name}/datadog-agent`,
              "awslogs-region": config.region,
              "awslogs-stream-prefix": "datadog-agent",
            },
          },
          healthCheck: {
            command: ["CMD-SHELL", "agent health || exit 1"],
            interval: 30,
            timeout: 5,
            retries: 3,
            startPeriod: 15,
          },
        }

        return JSON.stringify([def, datadogAgentDef])
      },
    )

  // Calculate valid Fargate CPU/memory combination
  // Fargate only supports specific predefined values
  const totalCpu = serviceConfig.cpu + DATADOG_AGENT_CPU
  const totalMemory = serviceConfig.memory + DATADOG_AGENT_MEMORY

  // Valid Fargate CPU values: 256, 512, 1024, 2048, 4096, 8192, 16384
  const validCpuValues = [256, 512, 1024, 2048, 4096, 8192, 16384]
  const taskCpu = validCpuValues.find((cpu) => cpu >= totalCpu) ?? 16384

  // Memory must be at least double the CPU (in MB) and in valid ranges
  const minMemoryForCpu: Record<number, number> = {
    256: 512,
    512: 1024,
    1024: 2048,
    2048: 4096,
    4096: 8192,
    8192: 16384,
    16384: 32768,
  }
  const taskMemory = Math.max(totalMemory, minMemoryForCpu[taskCpu] ?? 32768)

  return new aws.ecs.TaskDefinition(`${name}-${serviceConfig.name}-task`, {
    family: `${name}-${serviceConfig.name}`,
    cpu: taskCpu.toString(),
    memory: taskMemory.toString(),
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
  const latitudeTelemetryIngestUrl = `https://${config.domains.ingest}`

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
      secrets["voyage-api-key"].arn,
      secrets["latitude-telemetry-api-key"].arn,
      secrets["latitude-telemetry-project-slug"].arn,
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
        voyageApiKeyArn,
        latitudeTelemetryApiKeyArn,
        latitudeTelemetryProjectSlugArn,
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
          environment: [
            { name: "NODE_ENV", value: config.name === "production" ? "production" : "staging" },
            { name: "LAT_LATITUDE_TELEMETRY_INGEST_URL", value: latitudeTelemetryIngestUrl },
          ],
          secrets: [
            { name: "LAT_ADMIN_DATABASE_URL", valueFrom: dbSecretArn },
            { name: "CLICKHOUSE_MIGRATION_URL", valueFrom: clickhouseMigrationUrlArn },
            { name: "CLICKHOUSE_USER", valueFrom: clickhouseUserArn },
            { name: "CLICKHOUSE_PASSWORD", valueFrom: clickhousePasswordArn },
            { name: "CLICKHOUSE_DB", valueFrom: clickhouseDbArn },
            { name: "LAT_WEAVIATE_URL", valueFrom: weaviateUrlArn },
            { name: "LAT_WEAVIATE_API_KEY", valueFrom: weaviateApiKeyArn },
            { name: "LAT_VOYAGE_API_KEY", valueFrom: voyageApiKeyArn },
            // { name: "LAT_LATITUDE_TELEMETRY_API_KEY", valueFrom: latitudeTelemetryApiKeyArn },
            // { name: "LAT_LATITUDE_TELEMETRY_PROJECT_SLUG", valueFrom: latitudeTelemetryProjectSlugArn },
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
