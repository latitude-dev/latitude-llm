import * as aws from "@pulumi/aws"
import type { EnvironmentConfig } from "../config.ts"
import type { Ec2SecurityGroup, Ec2Vpc } from "./types.ts"

export interface SecurityGroupsOutput {
  alb: Ec2SecurityGroup
  ecs: Ec2SecurityGroup
  rds: Ec2SecurityGroup
  redis: Ec2SecurityGroup
  vpcEndpoints: Ec2SecurityGroup
  bastion: Ec2SecurityGroup
}

export function createSecurityGroups(name: string, config: EnvironmentConfig, vpc: Ec2Vpc): SecurityGroupsOutput {
  const albSg = new aws.ec2.SecurityGroup(`${name}-alb-sg`, {
    vpcId: vpc.id,
    description: "ALB security group",
    ingress: [
      {
        protocol: "TCP",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "TCP",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: `${name}-alb-sg`,
      Environment: config.name,
    },
  })

  const ecsSg = new aws.ec2.SecurityGroup(`${name}-ecs-sg`, {
    vpcId: vpc.id,
    description: "ECS tasks security group",
    ingress: [
      {
        protocol: "TCP",
        fromPort: 8080,
        toPort: 8080,
        securityGroups: [albSg.id],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: `${name}-ecs-sg`,
      Environment: config.name,
    },
  })

  const rdsSg = new aws.ec2.SecurityGroup(`${name}-rds-sg`, {
    vpcId: vpc.id,
    description: "RDS security group",
    ingress: [
      {
        protocol: "TCP",
        fromPort: 5432,
        toPort: 5432,
        securityGroups: [ecsSg.id],
      },
    ],
    tags: {
      Name: `${name}-rds-sg`,
      Environment: config.name,
    },
  })

  const redisSg = new aws.ec2.SecurityGroup(`${name}-redis-sg`, {
    vpcId: vpc.id,
    description: "Redis security group",
    ingress: [
      {
        protocol: "TCP",
        fromPort: 6379,
        toPort: 6379,
        securityGroups: [ecsSg.id],
      },
    ],
    tags: {
      Name: `${name}-redis-sg`,
      Environment: config.name,
    },
  })

  const vpcEndpointsSg = new aws.ec2.SecurityGroup(`${name}-vpc-endpoints-sg`, {
    vpcId: vpc.id,
    description: "VPC endpoints security group",
    ingress: [
      {
        protocol: "TCP",
        fromPort: 443,
        toPort: 443,
        securityGroups: [ecsSg.id],
      },
    ],
    tags: {
      Name: `${name}-vpc-endpoints-sg`,
      Environment: config.name,
    },
  })

  const bastionSg = new aws.ec2.SecurityGroup(`${name}-bastion-sg`, {
    vpcId: vpc.id,
    description: "Bastion instance security group (access via Tailscale VPN)",
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: `${name}-bastion-sg`,
      Environment: config.name,
    },
  })

  new aws.ec2.SecurityGroupRule(`${name}-bastion-to-rds`, {
    type: "ingress",
    fromPort: 5432,
    toPort: 5432,
    protocol: "TCP",
    securityGroupId: rdsSg.id,
    sourceSecurityGroupId: bastionSg.id,
  })

  new aws.ec2.SecurityGroupRule(`${name}-bastion-to-redis`, {
    type: "ingress",
    fromPort: 6379,
    toPort: 6379,
    protocol: "TCP",
    securityGroupId: redisSg.id,
    sourceSecurityGroupId: bastionSg.id,
  })

  return {
    alb: albSg,
    ecs: ecsSg,
    rds: rdsSg,
    redis: redisSg,
    vpcEndpoints: vpcEndpointsSg,
    bastion: bastionSg,
  }
}
