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

const DNS_ADDRESS = 'app.latitude.so'

// Create an ECR repository
export const repo = new aws.ecr.Repository('latitude-llm-app-repo')
export const coreRepo = new aws.ecr.Repository('latitude-llm-core-repo')

// Use existing images (replace 'latest' with the specific tag you want to deploy)
const imageName = pulumi.interpolate`${repo.repositoryUrl}:latest`
const coreImageName = pulumi.interpolate`${coreRepo.repositoryUrl}:latest`

// Create a Fargate task definition
const containerName = 'LatitudeLLMAppContainer'
// Create the log group
const logGroup = new aws.cloudwatch.LogGroup('LatitudeLLMAppLogGroup', {
  name: '/ecs/LatitudeLLMApp',
  retentionInDays: 7,
})

const taskDefinition = pulumi
  .all([logGroup.name, imageName, coreImageName, environment])
  .apply(
    ([logGroupName, imageName, coreImageName, environment]) =>
      new aws.ecs.TaskDefinition('LatitudeLLMAppTaskDefinition', {
        family: 'LatitudeLLMAppTaskFamily',
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

const greenTargetGroup = new aws.lb.TargetGroup('LatitudeLLMAppTg', {
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

const blueTargetGroup = new aws.lb.TargetGroup('LatitudeLLMAppBlueTg', {
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
      targetGroupArn: blueTargetGroup.arn,
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

const ecsService = new aws.ecs.Service(
  'LatitudeLLMApp',
  {
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
    desiredCount: 2,
    launchType: 'FARGATE',
    forceNewDeployment: true,
    enableExecuteCommand: true,
    deploymentController: {
      type: 'CODE_DEPLOY',
    },
    networkConfiguration: {
      subnets: privateSubnets.ids,
      assignPublicIp: false,
      securityGroups: [ecsSecurityGroup],
    },
    loadBalancers: [
      {
        targetGroupArn: blueTargetGroup.arn,
        containerName,
        containerPort: 8080,
      },
    ],
  },
  {
    ignoreChanges: ['taskDefinition'], // CodeDeploy controls the task definition that is deployed
  },
)

const codeDeployApp = new aws.codedeploy.Application(
  'LatitudeLLMCodeDeployApp',
  {
    name: 'LatitudeLLMCodeDeployApp',
    computePlatform: 'ECS',
  },
)

const codeDeployServiceRole = new aws.iam.Role('codeDeployServiceRole', {
  assumeRolePolicy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Effect: 'Allow',
        Principal: {
          Service: 'codedeploy.amazonaws.com',
        },
      },
    ],
  }),
})

// Attach the AWSCodeDeployRoleForECS policy to the role
new aws.iam.RolePolicyAttachment('codeDeployPolicy', {
  policyArn: 'arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS',
  role: codeDeployServiceRole,
})

new aws.codedeploy.DeploymentGroup('LatitudeLLMDeploymentGroup', {
  appName: codeDeployApp.name,
  serviceRoleArn: codeDeployServiceRole.arn,
  deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
  deploymentGroupName: 'LatitudeLLMDeploymentGroup',
  ecsService: {
    clusterName: cluster.name,
    serviceName: ecsService.name,
  },
  autoRollbackConfiguration: {
    enabled: true,
    events: ['DEPLOYMENT_FAILURE'],
  },
  blueGreenDeploymentConfig: {
    deploymentReadyOption: {
      actionOnTimeout: 'CONTINUE_DEPLOYMENT',
      waitTimeInMinutes: 0,
    },
    terminateBlueInstancesOnDeploymentSuccess: {
      action: 'TERMINATE',
      terminationWaitTimeInMinutes: 1,
    },
  },
  deploymentStyle: {
    deploymentOption: 'WITH_TRAFFIC_CONTROL',
    deploymentType: 'BLUE_GREEN',
  },
  loadBalancerInfo: {
    targetGroupPairInfo: {
      prodTrafficRoute: {
        listenerArns: [defaultListenerArn],
      },
      targetGroups: [
        { name: blueTargetGroup.name },
        { name: greenTargetGroup.name },
      ],
    },
  },
})

export const serviceUrl = pulumi.interpolate`https://${DNS_ADDRESS}`
