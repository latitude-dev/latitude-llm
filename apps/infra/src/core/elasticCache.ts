import * as aws from '@pulumi/aws'

import { privateSubnets, vpcId } from '../shared'

// Create a subnet group for the ElastiCache cluster
const subnetGroup = new aws.elasticache.SubnetGroup(
  'latitude-llm-cache-subnet-group',
  {
    subnetIds: privateSubnets.ids,
  },
)

// Create a security group for the ElastiCache cluster
const SecurityGroup = new aws.ec2.SecurityGroup('LatitudeLLMCacheSg', {
  description: 'Security group for ElastiCache cluster',
  vpcId,
  ingress: [
    {
      protocol: 'tcp',
      fromPort: 6379,
      toPort: 6379,
      cidrBlocks: ['10.10.0.0/16'], // Our VPC CIDR block
    },
  ],
})

// Create an ElastiCache cluster
const cacheCluster = new aws.elasticache.Cluster('LatitudeLLMCacheCluster', {
  engine: 'redis',
  nodeType: 'cache.t3.micro',
  numCacheNodes: 1,
  port: 6379,
  subnetGroupName: subnetGroup.name,
  securityGroupIds: [SecurityGroup.id],
})

const queueParameterGroup = new aws.elasticache.ParameterGroup(
  'LatitudeLLMQueueParameterGroup',
  {
    family: 'redis6.x',
    description: 'Custom parameter group for queue cluster',
    parameters: [
      {
        name: 'maxmemory-policy',
        value: 'noeviction',
      },
    ],
  },
)

const queueCluster = new aws.elasticache.Cluster('LatitudeLLMQueueCluster', {
  engine: 'redis',
  nodeType: 'cache.t3.micro',
  numCacheNodes: 1,
  port: 6379,
  subnetGroupName: subnetGroup.name,
  securityGroupIds: [SecurityGroup.id],
  parameterGroupName: queueParameterGroup.name,
})

// Export the cluster endpoint and port
export const cacheEndpoint = cacheCluster.cacheNodes[0].address
export const queueEndpoint = queueCluster.cacheNodes[0].address
