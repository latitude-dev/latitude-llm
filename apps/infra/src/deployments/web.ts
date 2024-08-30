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
import { coreStack, environment } from './shared'

const DNS_ADDRESS = 'app.latitude.so'

// Create an ECR repository
const repo = new aws.ecr.Repository('latitude-llm-app-repo')

// Build and push the Docker image
const token = await aws.ecr.getAuthorizationToken()
const image = new docker.Image('LatitudeLLMAppImage', {
  build: {
    platform: 'linux/amd64',
    context: resolve('../../../'),
    dockerfile: resolve('../../../apps/web/docker/Dockerfile'),
  },
  imageName: pulumi.interpolate`${repo.repositoryUrl}:latest`,
  registry: {
    server: repo.repositoryUrl,
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
  .all([logGroup.name, image.imageName, environment])
  .apply(
    ([logGroupName, imageName, environment]) =>
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
            image: imageName,
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
  tags: {
    diggest: image.repoDigest,
  },
  triggers: {
    diggest: image.repoDigest,
  },
})

export const serviceUrl = pulumi.interpolate`https://${DNS_ADDRESS}`
