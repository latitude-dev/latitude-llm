import * as aws from '@pulumi/aws'
import { Cluster } from '@pulumi/aws/ecs'
import * as pulumi from '@pulumi/pulumi'

import {
  ecsSecurityGroup,
  ecsTaskExecutionRole,
  privateSubnets,
  vpcId,
} from '../../shared'
import { coreStack, environment } from './shared'

const DNS_ADDRESS = 'ws.latitude.so'

// Create an ECR repository
const repo = new aws.ecr.Repository('latitude-llm-websockets-repo')

new aws.ecr.LifecyclePolicy('latitude-llm-websockets-repo-lifecycle', {
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

// Create a Fargate task definition
const containerName = 'LatitudeLLMWebsocketsContainer'
// Create the log group
const logGroup = new aws.cloudwatch.LogGroup('LatitudeLLMWebsocketsLogGroup', {
  name: '/ecs/LatitudeLLMWebsockets',
  retentionInDays: 7,
})

const taskDefinition = pulumi
  .all([logGroup.name, imageName, environment])
  .apply(
    ([logGroupName, imageName, environment]) =>
      new aws.ecs.TaskDefinition('LatitudeLLMWebsocketsTaskDefinition', {
        family: 'LatitudeLLMWebsocketsTaskFamily',
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
            portMappings: [
              { containerPort: 8080, hostPort: 8080, protocol: 'tcp' },
            ],
            environment,
            healthCheck: {
              command: [
                'CMD-SHELL',
                'curl -f http://localhost:8080/health || exit 1',
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

const targetGroup = new aws.lb.TargetGroup('LatitudeLLMWebsocketsTg', {
  port: 8080,
  vpcId,
  protocol: 'HTTP',
  targetType: 'ip',
  healthCheck: {
    path: '/health',
    interval: 5,
    timeout: 2,
    healthyThreshold: 2,
    unhealthyThreshold: 2,
  },
  deregistrationDelay: 5,
})

const defaultListenerArn = coreStack.requireOutput('defaultListenerArn')

new aws.lb.ListenerRule('LatitudeLLMWebsocketsListenerRule', {
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
new aws.ecs.Service('LatitudeLLMWebsockets', {
  cluster: cluster.arn,
  taskDefinition: taskDefinition.arn,
  desiredCount: 1,
  launchType: 'FARGATE',
  forceNewDeployment: true,
  enableExecuteCommand: true,
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
}, {
  ignoreChanges: ['taskDefinition', 'desiredCount'],
})

export const serviceUrl = pulumi.interpolate`https://${DNS_ADDRESS}`
