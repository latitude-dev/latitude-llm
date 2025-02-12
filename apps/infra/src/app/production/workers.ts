import * as aws from '@pulumi/aws'
import { Cluster } from '@pulumi/aws/ecs'
import * as pulumi from '@pulumi/pulumi'

import {
  ecsSecurityGroup,
  ecsTaskExecutionRole,
  privateSubnets,
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

const imageName = pulumi.interpolate`${repo.repositoryUrl}:latest`
const containerName = 'LatitudeLLMWorkersContainer'
const logGroup = new aws.cloudwatch.LogGroup('LatitudeLLMWorkersLogGroup', {
  name: '/ecs/LatitudeLLMWorkers',
  retentionInDays: 7,
})

const taskDefinition = pulumi
  .all([logGroup.name, imageName, environment])
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
}, {
  ignoreChanges: ['taskDefinition', 'desiredCount'],
})
