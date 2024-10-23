import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

import { euCentralVpc, vpcId } from '../shared'
import { subnets } from './networking'
import { rdsSecurityGroupId } from './rds'

const FCK_NAT_AMI_ID_EU_CENTRAL = 'ami-0591f971d15aec0ab'
const UBUNTU_AMI_ID_EU_CENTRAL = 'ami-099a546c02844706e'

// Function to create a security group
function createSecurityGroup(
  name: string,
  vpcId: pulumi.Input<string>,
  cidrBlock: pulumi.Input<string>,
  provider?: pulumi.ProviderResource,
) {
  return new aws.ec2.SecurityGroup(
    name,
    {
      vpcId,
      ingress: [
        {
          protocol: '-1',
          fromPort: 0,
          toPort: 0,
          cidrBlocks: [cidrBlock],
        },
      ],
      egress: [
        {
          protocol: '-1',
          fromPort: 0,
          toPort: 0,
          cidrBlocks: ['0.0.0.0/0'],
        },
      ],
    },
    { provider },
  )
}

// Function to create a network interface
function createNetworkInterface(
  name: string,
  subnetId: pulumi.Input<string>,
  securityGroupId: pulumi.Input<string>,
  provider?: pulumi.ProviderResource,
) {
  return new aws.ec2.NetworkInterface(
    name,
    {
      subnetId,
      sourceDestCheck: false,
      securityGroups: [securityGroupId],
    },
    { provider },
  )
}

// Function to create an EC2 instance
function createInstance(
  name: string,
  ami: string,
  networkInterfaceId: pulumi.Input<string>,
  provider?: pulumi.ProviderResource,
) {
  return new aws.ec2.Instance(
    name,
    {
      instanceType: 't4g.nano',
      ami,
      networkInterfaces: [
        {
          networkInterfaceId,
          deviceIndex: 0,
        },
      ],
      tags: {
        Name: name,
      },
    },
    { provider },
  )
}

// Function to create an EC2 proxy to RDS
function createEc2ProxyToRds(
  name: string,
  ami: string,
  subnetId: pulumi.Input<string>,
  securityGroupId: pulumi.Input<string>,
  keyName: string,
) {
  return new aws.ec2.Instance(name, {
    instanceType: 't4g.nano',
    ami,
    subnetId,
    vpcSecurityGroupIds: [securityGroupId],
    keyName,
    tags: {
      Name: name,
    },
  })
}

// Function to create a route table for private subnets
function createPrivateRouteTable(
  name: string,
  vpcId: pulumi.Input<string>,
  natInstanceId: pulumi.Input<string>,
  privateSubnetIds: pulumi.Input<string>[],
  provider?: pulumi.ProviderResource,
) {
  const routeTable = new aws.ec2.RouteTable(
    name,
    {
      vpcId: vpcId,
      routes: [
        {
          cidrBlock: '0.0.0.0/0',
          networkInterfaceId: natInstanceId,
        },
      ],
      tags: {
        Name: name,
      },
    },
    { provider },
  )

  // Associate the route table with private subnets
  privateSubnetIds.forEach((subnetId, index) => {
    new aws.ec2.RouteTableAssociation(
      `${name}-association-${index}`,
      {
        subnetId: subnetId,
        routeTableId: routeTable.id,
      },
      { provider },
    )
  })

  return routeTable
}

// Create security group for EC2
const ec2SecurityGroup = new aws.ec2.SecurityGroup('latitude-llm-ec2-sg', {
  vpcId,
  ingress: [
    {
      protocol: 'tcp',
      fromPort: 22,
      toPort: 22,
      cidrBlocks: ['0.0.0.0/0'], // Allow SSH from anywhere
    },
    {
      protocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      securityGroups: [rdsSecurityGroupId], // Allow PostgreSQL from RDS security group
    },
  ],
  egress: [
    {
      protocol: '-1',
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ['0.0.0.0/0'],
    },
  ],
})

// Create EC2 proxy to RDS
createEc2ProxyToRds(
  'latitude-llm-ec2',
  UBUNTU_AMI_ID_EU_CENTRAL,
  subnets.euCentral.public[0],
  ec2SecurityGroup.id,
  'latitude',
)

// EU Central NAT setup
const fckNatEuCentralSecurityGroup = createSecurityGroup(
  'fck-nat-eu-central-sg',
  euCentralVpc.id,
  euCentralVpc.cidrBlock,
) // Assuming VPC ID is used as CIDR block
const fckNatEuCentralNetworkInterface = createNetworkInterface(
  'fck-nat-eu-central-if',
  subnets.euCentral.public[0],
  fckNatEuCentralSecurityGroup.id,
)
createInstance(
  'fck-nat-eu-central',
  FCK_NAT_AMI_ID_EU_CENTRAL,
  fckNatEuCentralNetworkInterface.id,
)

// NOTE: The route tables for eu-central were created manually
// Create route table for EU Central private subnets
// subnets.euCentral.private.apply((privateSubnets) =>
//   createPrivateRouteTable(
//     'eu-central-private-rt',
//     euCentralVpc.id,
//     fckNatEuCentralNetworkInterface.id,
//     privateSubnets,
//   ),
// )
