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

const webProductionStack = new pulumi.StackReference('app-production-web')

const DNS_ADDRESS = 'gateway.latitude.so'

export const repo = new aws.ecr.Repository('latitude-llm-gateway-repo')

new aws.ecr.LifecyclePolicy('latitude-llm-gateway-repo-lifecycle', {
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

// Create a Fargate task definition
const containerName = 'LatitudeLLMGatewayContainer'
// Create the log group
const logGroup = new aws.cloudwatch.LogGroup('LatitudeLLMGatewayLogGroup', {
  name: '/ecs/LatitudeLLMGateway',
  retentionInDays: 7,
})

const imageName = pulumi.interpolate`${repo.repositoryUrl}:latest`

const taskDefinition = pulumi
  .all([logGroup.name, imageName, environment])
  .apply(
    ([logGroupName, imageName, environment]) =>
      new aws.ecs.TaskDefinition('LatitudeLLMGatewayTaskDefinition', {
        family: 'LatitudeLLMGatewayTaskFamily',
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
              interval: 10,
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

const greenTargetGroup = new aws.lb.TargetGroup('LatitudeLLMGatewayTg', {
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

const blueTargetGroup = new aws.lb.TargetGroup('LatitudeLLMGatewayBlueTg', {
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
new aws.lb.ListenerRule('LatitudeLLMGatewayListenerRule', {
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
  'LatitudeLLMGateway',
  {
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
    desiredCount: 2,
    launchType: 'FARGATE',
    forceNewDeployment: false,
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

const codeDeployGateway = new aws.codedeploy.Application(
  'LatitudeLLMCodeDeployGateway',
  {
    name: 'LatitudeLLMCodeDeployGateway',
    computePlatform: 'ECS',
  },
)

const codeDeployServiceRole = webProductionStack.requireOutput(
  'codeDeployServiceRole',
) as pulumi.Output<aws.iam.Role>

codeDeployServiceRole.arn.apply(
  (codeDeployServiceRoleArn: string) =>
    new aws.codedeploy.DeploymentGroup('LatitudeLLMGatewayDeploymentGroup', {
      appName: codeDeployGateway.name,
      serviceRoleArn: codeDeployServiceRoleArn,
      deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
      deploymentGroupName: 'LatitudeLLMGatewayDeploymentGroup',
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
    }),
)

export const serviceUrl = pulumi.interpolate`https://${DNS_ADDRESS}`
