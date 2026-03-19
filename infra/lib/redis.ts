import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"
import type { EnvironmentConfig } from "../config.ts"
import type {
  Ec2SecurityGroup,
  Ec2Subnet,
  ElasticacheCluster,
  ElasticacheSubnetGroup,
  MemorydbCluster,
  MemorydbSubnetGroup,
  RedisParameterGroup,
} from "./types.ts"

export interface RedisOutput {
  cache: {
    subnetGroup: ElasticacheSubnetGroup | MemorydbSubnetGroup
    cluster: ElasticacheCluster | MemorydbCluster
    connectionInfo: pulumi.Output<{ host: string; port: number }>
  }
  bullmq: {
    subnetGroup: ElasticacheSubnetGroup | MemorydbSubnetGroup
    cluster: ElasticacheCluster | MemorydbCluster
    parameterGroup?: RedisParameterGroup
    connectionInfo: pulumi.Output<{ host: string; port: number }>
  }
}

export function createRedis(
  name: string,
  config: EnvironmentConfig,
  privateSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
): RedisOutput {
  const cache =
    config.redis.cache.type === "elasticache"
      ? createElastiCache(name, "cache", config.redis.cache, privateSubnets, securityGroup)
      : createMemoryDB(name, "cache", config.redis.cache, privateSubnets, securityGroup)

  const bullmq =
    config.redis.bullmq.type === "elasticache"
      ? createElastiCacheBullMQ(name, config.redis.bullmq, privateSubnets, securityGroup)
      : createMemoryDBBullMQ(name, config.redis.bullmq, privateSubnets, securityGroup)

  return { cache, bullmq }
}

function createElastiCache(
  name: string,
  purpose: string,
  config: { nodeType: string; numNodes: number; multiAz: boolean },
  privateSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
): RedisOutput["cache"] {
  const subnetGroup = new aws.elasticache.SubnetGroup(`${name}-${purpose}-subnet`, {
    subnetIds: privateSubnets.map((s) => s.id),
    tags: {
      Name: `${name}-${purpose}-subnet`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const cluster = new aws.elasticache.Cluster(`${name}-${purpose}`, {
    engine: "redis",
    engineVersion: "7.0",
    nodeType: config.nodeType,
    numCacheNodes: config.numNodes,
    subnetGroupName: subnetGroup.name,
    securityGroupIds: [securityGroup.id],
    tags: {
      Name: `${name}-${purpose}`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const connectionInfo = pulumi.output({
    host: cluster.cacheNodes.apply((nodes) => nodes[0]?.address ?? ""),
    port: 6379,
  })

  return { subnetGroup, cluster, connectionInfo }
}

function createElastiCacheBullMQ(
  name: string,
  config: { nodeType: string; numNodes: number; multiAz: boolean; evictionPolicy: string },
  privateSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
): RedisOutput["bullmq"] {
  const subnetGroup = new aws.elasticache.SubnetGroup(`${name}-bullmq-subnet`, {
    subnetIds: privateSubnets.map((s) => s.id),
    tags: {
      Name: `${name}-bullmq-subnet`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const parameterGroup = new aws.elasticache.ParameterGroup(`${name}-bullmq-params`, {
    family: "redis7",
    description: "Custom parameter group for BullMQ with no-eviction policy",
    parameters: [
      {
        name: "maxmemory-policy",
        value: config.evictionPolicy,
      },
    ],
    tags: {
      Name: `${name}-bullmq-params`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const cluster = new aws.elasticache.Cluster(`${name}-bullmq`, {
    engine: "redis",
    engineVersion: "7.0",
    nodeType: config.nodeType,
    numCacheNodes: config.numNodes,
    subnetGroupName: subnetGroup.name,
    securityGroupIds: [securityGroup.id],
    parameterGroupName: parameterGroup.name,
    tags: {
      Name: `${name}-bullmq`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const connectionInfo = pulumi.output({
    host: cluster.cacheNodes.apply((nodes) => nodes[0]?.address ?? ""),
    port: 6379,
  })

  return { subnetGroup, cluster, parameterGroup, connectionInfo }
}

function createMemoryDB(
  name: string,
  purpose: string,
  config: { nodeType: string; numNodes: number; multiAz: boolean },
  privateSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
): RedisOutput["cache"] {
  const subnetGroup = new aws.memorydb.SubnetGroup(`${name}-${purpose}-subnet`, {
    subnetIds: privateSubnets.map((s) => s.id),
    tags: {
      Name: `${name}-${purpose}-subnet`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const cluster = new aws.memorydb.Cluster(`${name}-${purpose}`, {
    aclName: "open-access",
    nodeType: config.nodeType,
    numShards: 1,
    numReplicasPerShard: config.numNodes - 1,
    subnetGroupName: subnetGroup.name,
    securityGroupIds: [securityGroup.id],
    tags: {
      Name: `${name}-${purpose}`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const connectionInfo = pulumi.output({
    host: cluster.clusterEndpoints.apply((endpoints: Array<{ address: string }>) => endpoints[0]?.address ?? ""),
    port: 6379,
  })

  return { subnetGroup, cluster, connectionInfo }
}

function createMemoryDBBullMQ(
  name: string,
  config: { nodeType: string; numNodes: number; multiAz: boolean; evictionPolicy: string },
  privateSubnets: Ec2Subnet[],
  securityGroup: Ec2SecurityGroup,
): RedisOutput["bullmq"] {
  const subnetGroup = new aws.memorydb.SubnetGroup(`${name}-bullmq-subnet`, {
    subnetIds: privateSubnets.map((s) => s.id),
    tags: {
      Name: `${name}-bullmq-subnet`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const parameterGroup = new aws.memorydb.ParameterGroup(`${name}-bullmq-params`, {
    family: "memorydb_redis7",
    description: "Custom parameter group for BullMQ with no-eviction policy",
    parameters: [
      {
        name: "maxmemory-policy",
        value: config.evictionPolicy,
      },
    ],
    tags: {
      Name: `${name}-bullmq-params`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const cluster = new aws.memorydb.Cluster(`${name}-bullmq`, {
    aclName: "open-access",
    nodeType: config.nodeType,
    numShards: 1,
    numReplicasPerShard: config.numNodes - 1,
    subnetGroupName: subnetGroup.name,
    securityGroupIds: [securityGroup.id],
    parameterGroupName: parameterGroup.name,
    tags: {
      Name: `${name}-bullmq`,
      Environment: name.includes("staging") ? "staging" : "production",
    },
  })

  const connectionInfo = pulumi.output({
    host: cluster.clusterEndpoints.apply((endpoints: Array<{ address: string }>) => endpoints[0]?.address ?? ""),
    port: 6379,
  })

  return { subnetGroup, cluster, parameterGroup, connectionInfo }
}
