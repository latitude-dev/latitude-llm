import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

import { getPrivateSubnets, getPublicSubnets } from '../shared'
import { usEastProvider } from './cloudfront'

// Create a new VPC in US East
const usEastVpc = new aws.ec2.Vpc(
  'us-east-vpc',
  {
    cidrBlock: '172.16.0.0/16', // Changed from 10.0.0.0/16
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
      Name: 'latitude-llm-us-east-vpc',
    },
  },
  { provider: usEastProvider },
)

const usEastPrivateSubnet1 = new aws.ec2.Subnet(
  'us-east-private-subnet-1',
  {
    vpcId: usEastVpc.id,
    cidrBlock: '172.16.0.0/24', // Changed from 10.0.3.0/24
    availabilityZone: 'us-east-1a',
    tags: {
      Name: 'latitude-llm-us-east-1a',
    },
  },
  { provider: usEastProvider },
)

const usEastPrivateSubnet2 = new aws.ec2.Subnet(
  'us-east-private-subnet-2',
  {
    vpcId: usEastVpc.id,
    cidrBlock: '172.16.1.0/24', // Changed from 10.0.4.0/24
    availabilityZone: 'us-east-1b',
    tags: {
      Name: 'latitude-llm-us-east-1b',
    },
  },
  { provider: usEastProvider },
)

// New function to get EU Central subnets
const getEuCentralSubnets = async () => {
  const publicSubnets = await getPublicSubnets()
  const privateSubnets = await getPrivateSubnets()
  return {
    public: publicSubnets.ids,
    private: privateSubnets.ids,
  }
}

// Export all subnet information
export const subnets = pulumi.output({
  all: pulumi.output(getEuCentralSubnets()).apply((euCentral) => ({
    public: [...euCentral.public],
    private: [
      ...euCentral.private,
      usEastPrivateSubnet1.id,
      usEastPrivateSubnet2.id,
    ],
  })),
  usEast: {
    private: [usEastPrivateSubnet1.id, usEastPrivateSubnet2.id],
  },
  euCentral: pulumi.output(getEuCentralSubnets()),
})

export const usEastVpcId = usEastVpc.id
