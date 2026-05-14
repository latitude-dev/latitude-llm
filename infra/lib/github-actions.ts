import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"
import type { IamRole } from "./types.ts"

export interface GithubActionsOutput {
  deployRole: IamRole
}

function createDeployPolicy(environment: string): aws.iam.RolePolicyArgs["policy"] {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "ECSOperations",
        Effect: "Allow",
        Action: [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:RunTask",
          "ecs:ListTasks",
          "ecs:ListServices",
          "ecs:DescribeTasks",
        ],
        Resource: "*",
      },
      {
        Sid: "CloudWatchLogs",
        Effect: "Allow",
        Action: ["logs:DescribeLogStreams", "logs:GetLogEvents"],
        Resource: `arn:aws:logs:*:*:log-group:/ecs/latitude-${environment}*:log-stream:*`,
      },
      {
        Sid: "IAMPassRole",
        Effect: "Allow",
        Action: ["iam:PassRole"],
        Resource: `arn:aws:iam::*:role/latitude-${environment}-*`,
      },
    ],
  }
}

export function createGithubActionsOidc(
  name: string,
  environment: string,
  githubOwner: string,
  githubRepo: string,
): GithubActionsOutput {
  const oidcProvider = aws.iam.getOpenIdConnectProviderOutput({
    url: "https://token.actions.githubusercontent.com",
  })

  const assumeRolePolicy = pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Federated": "${oidcProvider.arn}"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": "repo:${githubOwner}/${githubRepo}:environment:${environment}"
          }
        }
      }
    ]
  }`

  const deployRole = new aws.iam.Role(`${name}-github-environment-deploy-role`, {
    assumeRolePolicy: assumeRolePolicy,
    tags: {
      Name: `${name}-github-environment-deploy-role`,
      Environment: environment,
      ManagedBy: "pulumi",
      Purpose: "github-actions-deploy-oidc",
    },
  })

  new aws.iam.RolePolicy(`${name}-environment-deploy-policy`, {
    role: deployRole.name,
    policy: createDeployPolicy(environment),
  })

  return {
    deployRole,
  }
}
