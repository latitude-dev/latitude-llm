import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"
import type { EnvironmentConfig } from "../config.ts"
import type { Ec2Instance, Ec2SecurityGroup, Ec2Subnet, Ec2Vpc, IamInstanceProfile, IamRole } from "./types.ts"

export interface BastionOutput {
  instance: Ec2Instance
  role: IamRole
  instanceProfile: IamInstanceProfile
}

export function createBastion(
  name: string,
  config: EnvironmentConfig,
  vpc: Ec2Vpc,
  publicSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
  amiId: pulumi.Input<string>,
): BastionOutput {
  const ssmRole = new aws.iam.Role(`${name}-bastion-ssm-role`, {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Service: "ec2.amazonaws.com",
          },
          Action: "sts:AssumeRole",
        },
      ],
    }),
    tags: {
      Name: `${name}-bastion-ssm-role`,
      Environment: config.name,
    },
  })

  new aws.iam.RolePolicyAttachment(`${name}-bastion-ssm-policy`, {
    role: ssmRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
  })

  const instanceProfile = new aws.iam.InstanceProfile(`${name}-bastion-profile`, {
    role: ssmRole.name,
    tags: {
      Name: `${name}-bastion-profile`,
      Environment: config.name,
    },
  })

  const instance = new aws.ec2.Instance(`${name}-bastion`, {
    instanceType: "t3.nano",
    ami: amiId,
    subnetId: publicSubnets[0].id,
    vpcSecurityGroupIds: [securityGroup.id],
    iamInstanceProfile: instanceProfile.name,
    associatePublicIpAddress: true,
    userData: pulumi.interpolate`#!/bin/bash
dnf install -y postgresql redis
`,
    tags: {
      Name: `${name}-bastion`,
      Environment: config.name,
      Role: "bastion",
    },
  })

  return {
    instance,
    role: ssmRole,
    instanceProfile,
  }
}
