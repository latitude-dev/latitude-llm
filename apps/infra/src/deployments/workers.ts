import * as aws from '@pulumi/aws'
import { Cluster } from '@pulumi/aws/ecs'
import * as docker from '@pulumi/docker'
import * as pulumi from '@pulumi/pulumi'

import {
  ecsSecurityGroup,
  ecsTaskExecutionRole,
  privateSubnets,
  resolve,
} from '../shared'
import { coreStack, environment } from './shared'

// Create an ECR repository
const repo = new aws.ecr.Repository('latitude-llm-workers-repo')

// Build and push the Docker image
const token = await aws.ecr.getAuthorizationToken()
const image = new docker.Image('LatitudeLLMWorkersImage', {
  build: {
    platform: 'linux/amd64',
    context: resolve('../../../'),
    dockerfile: resolve('../../../apps/workers/docker/Dockerfile'),
  },
  imageName: pulumi.interpolate`${repo.repositoryUrl}:latest`,
  registry: {
    server: repo.repositoryUrl,
    username: token.userName,
    password: pulumi.secret(token.password),
  },
})

// Create a Fargate task definition
const containerName = 'LatitudeLLMWorkersContainer'
// Create the log group
const logGroup = new aws.cloudwatch.LogGroup('LatitudeLLMWorkersLogGroup', {
  name: '/ecs/LatitudeLLMWorkers',
  retentionInDays: 7,
})

const taskDefinition = pulumi
  .all([logGroup.name, image.imageName, environment])
  .apply(
    ([logGroupName, imageName, environment]) =>
      new aws.ecs.TaskDefinition('LatitudeLLMWorkersTaskDefinition', {
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
        ]),
      }),
  )

const cluster = coreStack.requireOutput('cluster') as pulumi.Output<Cluster>
export const service = new aws.ecs.Service('LatitudeLLMWorkers', {
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
  tags: {
    diggest: image.repoDigest,
  },
  triggers: {
    diggest: image.repoDigest,
  },
})
