import * as aws from '@pulumi/aws'
import { Cluster } from '@pulumi/aws/ecs'
import * as docker from '@pulumi/docker'
import * as pulumi from '@pulumi/pulumi'

import {
  ecsSecurityGroup,
  ecsTaskExecutionRole,
  privateSubnets,
  resolve,
  vpcId,
} from '../shared'
import {
  coreStack,
  environment,
  sentryDsn,
  sentryOrg,
  sentryProject,
} from './shared'

const DNS_ADDRESS = 'app.latitude.so'

// Create an ECR repository
const repo = new aws.ecr.Repository('latitude-llm-app-repo')
const coreRepo = new aws.ecr.Repository('latitude-llm-core-repo')

// Build and push the Docker image
const token = await aws.ecr.getAuthorizationToken()

const image = pulumi.all([sentryDsn, sentryOrg, sentryProject]).apply(
  ([sentryDsn, sentryOrg, sentryProject]) =>
    new docker.Image('LatitudeLLMAppImage', {
      build: {
        platform: 'linux/amd64',
        context: resolve('../../../'),
        dockerfile: resolve('../../../apps/web/docker/Dockerfile'),
        cacheFrom: {
          images: [pulumi.interpolate`${repo.repositoryUrl}:latest`],
        },
        args: {
          SENTRY_DSN: sentryDsn,
          SENTRY_ORG: sentryOrg,
          SENTRY_PROJECT: sentryProject,
        },
      },
      imageName: pulumi.interpolate`${repo.repositoryUrl}:latest`,
      registry: {
        server: repo.repositoryUrl,
        username: token.userName,
        password: pulumi.secret(token.password),
      },
    }),
)
const coreImage = new docker.Image('LatitudeLLMCoreImage', {
  build: {
    platform: 'linux/amd64',
    context: resolve('../../../'),
    dockerfile: resolve('../../../packages/core/docker/Dockerfile'),
    cacheFrom: {
      images: [pulumi.interpolate`${coreRepo.repositoryUrl}:latest`],
    },
  },
  imageName: pulumi.interpolate`${coreRepo.repositoryUrl}:latest`,
  registry: {
    server: coreRepo.repositoryUrl,
    username: token.userName,
    password: pulumi.secret(token.password),
  },
})

// Create a Fargate task definition
const containerName = 'LatitudeLLMAppContainer'
// Create the log group
const logGroup = new aws.cloudwatch.LogGroup('LatitudeLLMAppLogGroup', {
  name: '/ecs/LatitudeLLMApp',
  retentionInDays: 7,
})

const taskDefinition = pulumi
  .all([logGroup.name, image.imageName, coreImage.imageName, environment])
  .apply(
    ([logGroupName, imageName, coreImageName, environment]) =>
      new aws.ecs.TaskDefinition('LatitudeLLMAppTaskDefinition', {
        family: 'LatitudeLLMTaskFamily',
        cpu: '256',
        memory: '512',
        networkMode: 'awsvpc',
        requiresCompatibilities: ['FARGATE'],
        executionRoleArn: ecsTaskExecutionRole,
        containerDefinitions: JSON.stringify([
          {
            name: containerName,
            image: imageName,
            essential: true,
            portMappings: [
              { containerPort: 8080, hostPort: 8080, protocol: 'tcp' },
            ],
            environment,
            healthCheck: {
              command: [
                'CMD-SHELL',
                'curl -f http://localhost:8080/api/health || exit 1',
              ],
              interval: 30,
              timeout: 5,
              retries: 3,
              startPeriod: 60,
            },
            logConfiguration: {
              logDriver: 'awslogs',
              options: {
                'awslogs-group': logGroupName,
                'awslogs-region': 'eu-central-1',
                'awslogs-stream-prefix': 'ecs',
              },
            },
          },
          {
            name: 'db-migrate',
            image: coreImageName,
            command: ['pnpm', '--prefix', 'packages/core', 'db:migrate'],
            essential: false,
            environment,
            logConfiguration: {
              logDriver: 'awslogs',
              options: {
                'awslogs-group': logGroupName,
                'awslogs-region': 'eu-central-1',
                'awslogs-stream-prefix': 'ecs',
              },
            },
          },
        ]),
      }),
  )

const targetGroup = new aws.lb.TargetGroup('LatitudeLLMAppTg', {
  port: 8080,
  vpcId,
  protocol: 'HTTP',
  targetType: 'ip',
  healthCheck: {
    path: '/api/health',
    interval: 5,
    timeout: 2,
    healthyThreshold: 2,
    unhealthyThreshold: 2,
  },
  deregistrationDelay: 5,
})

const defaultListenerArn = coreStack.requireOutput('defaultListenerArn')

new aws.lb.ListenerRule('LatitudeLLMAppListenerRule', {
  listenerArn: defaultListenerArn,
  actions: [
    {
      type: 'forward',
      targetGroupArn: targetGroup.arn,
    },
  ],
  conditions: [
    {
      hostHeader: {
        values: [DNS_ADDRESS],
      },
    },
  ],
})

const cluster = coreStack.requireOutput('cluster') as pulumi.Output<Cluster>
new aws.ecs.Service('LatitudeLLMApp', {
  cluster: cluster.arn,
  taskDefinition: taskDefinition.arn,
  desiredCount: 1,
  launchType: 'FARGATE',
  forceNewDeployment: true,
  networkConfiguration: {
    subnets: privateSubnets.ids,
    assignPublicIp: false,
    securityGroups: [ecsSecurityGroup],
  },
  loadBalancers: [
    {
      targetGroupArn: targetGroup.arn,
      containerName,
      containerPort: 8080,
    },
  ],
  triggers: {
    digest: image.repoDigest,
    coreDigest: coreImage.repoDigest,
  },
})

export const serviceUrl = pulumi.interpolate`https://${DNS_ADDRESS}`
