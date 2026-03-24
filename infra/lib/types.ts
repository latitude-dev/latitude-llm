import type * as aws from "@pulumi/aws"

export type Ec2Vpc = aws.ec2.Vpc
export type Ec2Subnet = aws.ec2.Subnet
export type Ec2NatGateway = aws.ec2.NatGateway
export type Ec2VpcEndpoint = aws.ec2.VpcEndpoint
export type Ec2SecurityGroup = aws.ec2.SecurityGroup
export type Ec2RouteTable = aws.ec2.RouteTable
export type Ec2Instance = aws.ec2.Instance
export type Eip = aws.ec2.Eip

export type EcsCluster = aws.ecs.Cluster
export type EcsTaskDefinition = aws.ecs.TaskDefinition
export type EcsService = aws.ecs.Service

export type RdsSubnetGroup = aws.rds.SubnetGroup
export type RdsParameterGroup = aws.rds.ParameterGroup
export type RdsCluster = aws.rds.Cluster
export type RdsClusterInstance = aws.rds.ClusterInstance
export type RdsInstance = aws.rds.Instance

export type ElasticacheSubnetGroup = aws.elasticache.SubnetGroup
export type ElasticacheCluster = aws.elasticache.Cluster
export type ElasticacheParameterGroup = aws.elasticache.ParameterGroup
export type MemorydbSubnetGroup = aws.memorydb.SubnetGroup
export type MemorydbCluster = aws.memorydb.Cluster
export type MemorydbParameterGroup = aws.memorydb.ParameterGroup
export type RedisParameterGroup = aws.elasticache.ParameterGroup | aws.memorydb.ParameterGroup

export type S3Bucket = aws.s3.Bucket
export type S3BucketLifecycleConfiguration = aws.s3.BucketLifecycleConfiguration

export type LbLoadBalancer = aws.lb.LoadBalancer
export type LbTargetGroup = aws.lb.TargetGroup
export type LbListener = aws.lb.Listener

export type Route53Record = aws.route53.Record
export type AcmCertificate = aws.acm.Certificate
export type AcmCertificateValidation = aws.acm.CertificateValidation

export type IamRole = aws.iam.Role
export type IamPolicy = aws.iam.Policy
export type IamPolicyAttachment = aws.iam.PolicyAttachment
export type IamOpenidConnectProvider = aws.iam.OpenIdConnectProvider
export type IamInstanceProfile = aws.iam.InstanceProfile

export type CloudwatchLogGroup = aws.cloudwatch.LogGroup

export type SecretsmanagerSecret = aws.secretsmanager.Secret
export type SecretsmanagerSecretVersion = aws.secretsmanager.SecretVersion
