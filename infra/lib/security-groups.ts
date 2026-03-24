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

  // RDS/Redis ingress use aws.vpc.SecurityGroupIngressRule (one referenced SG per rule).
  // Inline `ingress` with multiple securityGroups is unreliable in the AWS provider and can
  // leave Pulumi state out of sync with EC2 (no drift on `pulumi preview`).
  const rdsSg = new aws.ec2.SecurityGroup(`${name}-rds-sg`, {
    vpcId: vpc.id,
    description: "RDS security group",
    ingress: [],
    tags: {
      Name: `${name}-rds-sg`,
      Environment: config.name,
    },
  })

  const redisSg = new aws.ec2.SecurityGroup(`${name}-redis-sg`, {
    vpcId: vpc.id,
    description: "Redis security group",
    ingress: [],
    tags: {
      Name: `${name}-redis-sg`,
      Environment: config.name,
    },
  })

  new aws.vpc.SecurityGroupIngressRule(`${name}-rds-from-ecs`, {
    securityGroupId: rdsSg.id,
    referencedSecurityGroupId: ecsSg.id,
    ipProtocol: "tcp",
    fromPort: 5432,
    toPort: 5432,
    description: "PostgreSQL from ECS tasks",
  })

  new aws.vpc.SecurityGroupIngressRule(`${name}-rds-from-bastion`, {
    securityGroupId: rdsSg.id,
    referencedSecurityGroupId: bastionSg.id,
    ipProtocol: "tcp",
    fromPort: 5432,
    toPort: 5432,
    description: "PostgreSQL from bastion",
  })

  new aws.vpc.SecurityGroupIngressRule(`${name}-redis-from-ecs`, {
    securityGroupId: redisSg.id,
    referencedSecurityGroupId: ecsSg.id,
    ipProtocol: "tcp",
    fromPort: 6379,
    toPort: 6379,
    description: "Redis from ECS tasks",
  })

  new aws.vpc.SecurityGroupIngressRule(`${name}-redis-from-bastion`, {
    securityGroupId: redisSg.id,
    referencedSecurityGroupId: bastionSg.id,
    ipProtocol: "tcp",
    fromPort: 6379,
    toPort: 6379,
    description: "Redis from bastion",
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

  return {
    alb: albSg,
    ecs: ecsSg,
    rds: rdsSg,
    redis: redisSg,
    vpcEndpoints: vpcEndpointsSg,
    bastion: bastionSg,
  }
}
