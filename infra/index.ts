import * as pulumi from "@pulumi/pulumi"
import { defaults, type EnvironmentConfig, productionConfig, stagingConfig } from "./config.ts"
import { createAlb } from "./lib/alb.ts"
import { createBastion } from "./lib/bastion.ts"
import { createCertificate, createDnsRecords } from "./lib/dns.ts"
import { createEcs } from "./lib/ecs.ts"
import { createGithubActionsOidc } from "./lib/github-actions.ts"
import { createRds } from "./lib/rds.ts"
import { createRedis } from "./lib/redis.ts"
import { createS3 } from "./lib/s3.ts"
import { createApplicationSecrets } from "./lib/secrets.ts"
import { createSecurityGroups } from "./lib/security-groups.ts"
import { createVpc } from "./lib/vpc.ts"
import { createVpcEndpoints } from "./lib/vpc-endpoints.ts"

const config = new pulumi.Config()
const stackName = pulumi.getStack()
const environment = stackName === "production" ? "production" : "staging"
const envConfig: EnvironmentConfig = environment === "production" ? productionConfig : stagingConfig

const imageTag = config.get("imageTag") ?? "latest"
const hostedZoneId = config.get("hostedZoneId") ?? defaults.hostedZoneId
const domainName = config.get("domainName") ?? defaults.domainName
const githubOwner = config.get("githubOwner") ?? "latitude-dev"
const githubRepo = config.get("githubRepo") ?? "latitude"

const temporalCloudAddress = config.get("temporalCloudAddress") ?? `${envConfig.region}.aws.api.temporal.io:7233`
const temporalCloudNamespace = config.get("temporalCloudNamespace") ?? ""
const temporalTaskQueue = config.get("temporalTaskQueue") ?? "latitude-workflows"

const name = `latitude-${environment}`

pulumi.log.info(`Deploying ${environment} environment to ${envConfig.region}`)

const vpc = createVpc(name, envConfig)

const securityGroups = createSecurityGroups(name, envConfig, vpc.vpc)

const vpcEndpoints = createVpcEndpoints(
  name,
  envConfig,
  vpc.vpc,
  vpc.publicSubnets,
  vpc.privateSubnets,
  vpc.privateRouteTable?.id,
  vpc.publicRouteTable.id,
  securityGroups.vpcEndpoints,
)

const certificate = createCertificate(name, envConfig, hostedZoneId, domainName)

const alb = createAlb(
  name,
  envConfig,
  vpc.publicSubnets,
  securityGroups.alb,
  certificate.certificateValidation?.certificateArn ?? certificate.certificate.arn,
)

const _dns = createDnsRecords(name, envConfig, alb.alb, hostedZoneId)

const rds = createRds(name, envConfig, vpc.privateSubnets, securityGroups.rds)

const redis = createRedis(name, envConfig, vpc.privateSubnets, securityGroups.redis)

const bastion = createBastion(name, envConfig, vpc.vpc, vpc.publicSubnets, securityGroups.bastion)

const s3 = createS3(name, envConfig)

const appSecrets = createApplicationSecrets(name, environment)

const ecs = createEcs(
  name,
  envConfig,
  vpc.privateSubnets,
  securityGroups.ecs,
  appSecrets.secrets,
  rds.secret,
  rds.adminSecret,
  redis.cache.connectionInfo.host,
  redis.bullmq.connectionInfo.host,
  s3.bucket,
  imageTag,
  {
    web: alb.targetGroups.web.arn,
    api: alb.targetGroups.api.arn,
    ingest: alb.targetGroups.ingest.arn,
    bullBoard: alb.targetGroups.bullBoard.arn,
  },
  {
    address: temporalCloudAddress,
    namespace: temporalCloudNamespace,
    taskQueue: temporalTaskQueue,
  },
)

const githubActions = createGithubActionsOidc(name, environment, githubOwner, githubRepo)

export const outputs = {
  environment: environment,
  region: envConfig.region,

  vpcId: vpc.vpc.id,
  publicSubnetIds: vpc.publicSubnets.map((s) => s.id),
  privateSubnetIds: vpc.privateSubnets.map((s) => s.id),

  albDnsName: alb.alb.dnsName,
  albZoneId: alb.alb.zoneId,

  rdsEndpoint: rds.cluster?.endpoint ?? rds.dbInstance!.address,
  rdsSecretArn: rds.secret.arn,

  redisCacheEndpoint: redis.cache.connectionInfo.host,
  redisBullmqEndpoint: redis.bullmq.connectionInfo.host,

  s3BucketName: s3.bucket.id,

  ecsClusterName: ecs.cluster.name,
  ecsServiceNames: Object.fromEntries(Object.entries(ecs.services).map(([k, v]) => [k, v.name])),

  certificateArn: certificate.certificate.arn,

  githubActionsRoleArn: githubActions.deployRole.arn,

  bastionInstanceId: bastion.instance.id,

  domains: envConfig.domains,
}
