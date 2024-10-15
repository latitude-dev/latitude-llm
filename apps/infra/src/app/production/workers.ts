import * as aws from '@pulumi/aws'
import { Cluster } from '@pulumi/aws/ecs'
import * as docker from '@pulumi/docker'
import * as pulumi from '@pulumi/pulumi'

import {
  ecsSecurityGroup,
  ecsTaskExecutionRole,
  privateSubnets,
  resolve,
} from '../../shared'
import { coreStack, environment } from './shared'

const repo = new aws.ecr.Repository('latitude-llm-workers-repo')

new aws.ecr.LifecyclePolicy('latitude-llm-workers-repo-lifecycle', {
  repository: repo.name,
  policy: JSON.stringify({
    rules: [
      {
        rulePriority: 1,
        description: 'Keep last 7 days of images',
        selection: {
          tagStatus: 'any',
          countType: 'sinceImagePushed',
          countUnit: 'days',
          countNumber: 7,
        },
        action: {
          type: 'expire',
        },
      },
    ],
  }),
})

const token = await aws.ecr.getAuthorizationToken()
const image = new docker.Image('LatitudeLLMWorkersImage', {
  build: {
    platform: 'linux/amd64',
    context: resolve('../../../'),
    dockerfile: resolve('../../../apps/workers/docker/Dockerfile'),
    cacheFrom: {
      images: [pulumi.interpolate`${repo.repositoryUrl}:latest`],
    },
    args: {
      SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN!,
    },
  },
  imageName: pulumi.interpolate`${repo.repositoryUrl}:latest`,
  registry: {
    server: repo.repositoryUrl,
    username: token.userName,
    password: pulumi.secret(token.password),
  },
})

const containerName = 'LatitudeLLMWorkersContainer'
const logGroup = new aws.cloudwatch.LogGroup('LatitudeLLMWorkersLogGroup', {
  name: '/ecs/LatitudeLLMWorkers',
  retentionInDays: 7,
})

const taskDefinition = pulumi
  .all([logGroup.name, image.imageName, environment])
  .apply(
    ([logGroupName, imageName, environment]) =>
      new aws.ecs.TaskDefinition('LatitudeLLMWorkersTaskDefinition', {
        family: 'LatitudeLLMWorkersTaskFamily',
        cpu: '256',
        memory: '512',
        networkMode: 'awsvpc',
        requiresCompatibilities: ['FARGATE'],
        executionRoleArn: ecsTaskExecutionRole,
        taskRoleArn: ecsTaskExecutionRole,
        containerDefinitions: JSON.stringify([
          {
            name: containerName,
            image: imageName,
            essential: true,
            environment,
            healthCheck: {
              command: [
                'CMD-SHELL',
                'curl -f http://localhost:3002/health || exit 1',
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
        ]),
      }),
  )

const cluster = coreStack.requireOutput('cluster') as pulumi.Output<Cluster>
export const service = new aws.ecs.Service('LatitudeLLMWorkers', {
  cluster: cluster.arn,
  taskDefinition: taskDefinition.arn,
  desiredCount: 2,
  launchType: 'FARGATE',
  forceNewDeployment: true,
  enableExecuteCommand: true,
  networkConfiguration: {
    subnets: privateSubnets.ids,
    assignPublicIp: false,
    securityGroups: [ecsSecurityGroup],
  },
  tags: {
    diggest: image.repoDigest,
  },
  triggers: {
    diggest: image.repoDigest,
  },
})
