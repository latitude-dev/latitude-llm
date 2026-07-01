import * as aws from "@pulumi/aws"
import type { Output } from "@pulumi/pulumi"
import type { EnvironmentConfig, ServiceConfig } from "../config.ts"
import type { AlbOutput } from "./alb.ts"
import type { EcsCluster, EcsService, IamRole } from "./types.ts"

const ALB_FRONTED_DOMAIN_KEYS = ["web", "api", "ingest", "bullBoard"] as const
type AlbFrontedDomainKey = (typeof ALB_FRONTED_DOMAIN_KEYS)[number]

const DOMAIN_KEY_TO_SERVICE: Record<AlbFrontedDomainKey, ServiceConfig["name"]> = {
  web: "web",
  api: "api",
  ingest: "ingest",
  bullBoard: "workers",
}

export interface CodeDeployOutput {
  application: aws.codedeploy.Application
  serviceRole: IamRole
  deploymentGroups: Record<string, aws.codedeploy.DeploymentGroup>
}

export function createCodeDeploy(
  name: string,
  config: EnvironmentConfig,
  cluster: EcsCluster,
  services: Record<string, EcsService>,
  alb: AlbOutput,
  httpsListenerArn: Output<string>,
): CodeDeployOutput {
  const application = new aws.codedeploy.Application(`${name}-codedeploy`, {
    computePlatform: "ECS",
    tags: {
      Name: `${name}-codedeploy`,
      Environment: config.name,
    },
  })

  const serviceRole = new aws.iam.Role(`${name}-codedeploy-role`, {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "codedeploy.amazonaws.com",
          },
        },
      ],
    }),
    tags: {
      Name: `${name}-codedeploy-role`,
      Environment: config.name,
    },
  })

  new aws.iam.RolePolicyAttachment(`${name}-codedeploy-ecs-policy`, {
    role: serviceRole.name,
    policyArn: "arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS",
  })

  const deploymentGroups: Record<string, aws.codedeploy.DeploymentGroup> = {}

  for (const domainKey of ALB_FRONTED_DOMAIN_KEYS) {
    const serviceName = DOMAIN_KEY_TO_SERVICE[domainKey]
    const ecsService = services[serviceName]
    const targetGroupPair = alb.targetGroups[domainKey]

    deploymentGroups[serviceName] = new aws.codedeploy.DeploymentGroup(
      `${name}-${serviceName}-codedeploy-dg`,
      {
        appName: application.name,
        deploymentGroupName: `${name}-${serviceName}`,
        serviceRoleArn: serviceRole.arn,
        deploymentConfigName: "CodeDeployDefault.ECSAllAtOnce",
        deploymentStyle: {
          deploymentType: "BLUE_GREEN",
          deploymentOption: "WITH_TRAFFIC_CONTROL",
        },
        autoRollbackConfiguration: {
          enabled: true,
          events: ["DEPLOYMENT_FAILURE"],
        },
        blueGreenDeploymentConfig: {
          deploymentReadyOption: {
            actionOnTimeout: "CONTINUE_DEPLOYMENT",
            waitTimeInMinutes: 0,
          },
          terminateBlueInstancesOnDeploymentSuccess: {
            action: "TERMINATE",
            terminationWaitTimeInMinutes: 5,
          },
        },
        ecsService: {
          clusterName: cluster.name,
          serviceName: ecsService.name,
        },
        loadBalancerInfo: {
          targetGroupPairInfo: {
            prodTrafficRoute: {
              listenerArns: [httpsListenerArn],
            },
            targetGroups: [
              { name: targetGroupPair.blue.name },
              { name: targetGroupPair.green.name },
            ],
          },
        },
        tags: {
          Name: `${name}-${serviceName}-codedeploy-dg`,
          Environment: config.name,
          Service: serviceName,
        },
      },
    )
  }

  return {
    application,
    serviceRole,
    deploymentGroups,
  }
}

export function isCodeDeployService(serviceName: string): boolean {
  return (Object.values(DOMAIN_KEY_TO_SERVICE) as string[]).includes(serviceName)
}
