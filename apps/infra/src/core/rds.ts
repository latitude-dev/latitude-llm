import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

import { privateSubnets, vpcId } from '../shared'

const cfg = new pulumi.Config()

// Create a new security group for RDS
const rdsSecurityGroup = new aws.ec2.SecurityGroup('latitude-llm-rds-sg', {
  vpcId,
  ingress: [
    {
      protocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      cidrBlocks: ['10.10.0.0/16'], // Our VPC CIDR block
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

const privateSubnetGroup = new aws.rds.SubnetGroup(
  'latitude-llm-db-subnet-group',
  {
    subnetIds: privateSubnets.ids,
  },
)

const DATABASE_NAME = 'latitude_llm_production'
const DATABASE_USERNAME = 'latitude'
const DATABASE_PASSWORD = cfg.requireSecret('databasePassword')

// Create a new secret in AWS Secrets Manager
const dbPasswordSecret = new aws.secretsmanager.Secret('rds-password-secret', {
  name: 'latitude-llm-rds-password',
  description: 'Password for Latitude LLM RDS instance',
})

const dbPasswordSecretVersion = new aws.secretsmanager.SecretVersion(
  'rds-password-secret-version',
  {
    secretId: dbPasswordSecret.id,
    secretString: DATABASE_PASSWORD,
  },
)

const db = new aws.rds.Instance('latitude-llm-db', {
  engine: 'postgres',
  engineVersion: '15.8',
  instanceClass: 'db.t3.small',
  allocatedStorage: 20,
  dbName: DATABASE_NAME,
  backupRetentionPeriod: 14,
  username: DATABASE_USERNAME,
  password: dbPasswordSecret.arn.apply((arn) =>
    aws.secretsmanager
      .getSecretVersion({ secretId: arn })
      .then((version) => version.secretString),
  ),
  skipFinalSnapshot: false,
  vpcSecurityGroupIds: [rdsSecurityGroup.id],
  dbSubnetGroupName: privateSubnetGroup.name,
  publiclyAccessible: false,
  storageEncrypted: true,
})

export const rdsSecurityGroupId = rdsSecurityGroup.id

export const dbEndpoint = db.endpoint
export const dbPasswordSecretId = dbPasswordSecret.id
export const dbUsername = DATABASE_USERNAME
export const dbName = DATABASE_NAME
