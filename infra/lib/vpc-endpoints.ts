import * as aws from "@pulumi/aws"
import type { Input } from "@pulumi/pulumi"
import type { EnvironmentConfig } from "../config.ts"
import type { Ec2SecurityGroup, Ec2Subnet, Ec2Vpc, Ec2VpcEndpoint } from "./types.ts"

export interface VpcEndpointsOutput {
  s3: Ec2VpcEndpoint
  secretsManager: Ec2VpcEndpoint
}

export function createVpcEndpoints(
  name: string,
  config: EnvironmentConfig,
  vpc: Ec2Vpc,
  publicSubnets: Ec2Subnet[],
  privateSubnets: Ec2Subnet[],
  privateRouteTableId: Input<string> | undefined,
  publicRouteTableId: Input<string>,
  vpcEndpointsSecurityGroup: Ec2SecurityGroup,
): VpcEndpointsOutput {
  const s3Endpoint = new aws.ec2.VpcEndpoint(`${name}-s3-endpoint`, {
    vpcId: vpc.id,
    serviceName: `com.amazonaws.${config.region}.s3`,
    vpcEndpointType: "Gateway",
    routeTableIds: privateRouteTableId ? [publicRouteTableId, privateRouteTableId] : [publicRouteTableId],
    tags: {
      Name: `${name}-s3-endpoint`,
      Environment: config.name,
    },
  })

  const secretsManagerEndpoint = new aws.ec2.VpcEndpoint(`${name}-secretsmanager-endpoint`, {
    vpcId: vpc.id,
    serviceName: `com.amazonaws.${config.region}.secretsmanager`,
    vpcEndpointType: "Interface",
    subnetIds: privateSubnets.map((s) => s.id),
    securityGroupIds: [vpcEndpointsSecurityGroup.id],
    privateDnsEnabled: true,
    tags: {
      Name: `${name}-secretsmanager-endpoint`,
      Environment: config.name,
    },
  })

  return {
    s3: s3Endpoint,
    secretsManager: secretsManagerEndpoint,
  }
}
