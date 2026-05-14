import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"
import type { EnvironmentConfig } from "../config.ts"

export interface SecurityComplianceOutput {
  configRecorder: aws.cfg.Recorder
  configDeliveryChannel: aws.cfg.DeliveryChannel
  cloudTrail: aws.cloudtrail.Trail
  cloudTrailLogGroup: aws.cloudwatch.LogGroup
  guardDutyDetector: aws.guardduty.Detector
}

const serviceAssumeRolePolicy = (service: string) =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: service,
        },
        Action: "sts:AssumeRole",
      },
    ],
  })

function createComplianceBucket(name: string, config: EnvironmentConfig, purpose: string): aws.s3.Bucket {
  const bucket = new aws.s3.Bucket(
    `${name}-${purpose}`,
    {
      bucket: `${name}-${purpose}`,
      forceDestroy: config.name !== "production",
      tags: {
        Name: `${name}-${purpose}`,
        Environment: config.name,
        Purpose: purpose,
      },
    },
    {
      protect: config.name === "production",
    },
  )

  new aws.s3.BucketVersioning(`${name}-${purpose}-versioning`, {
    bucket: bucket.id,
    versioningConfiguration: {
      status: "Enabled",
    },
  })

  new aws.s3.BucketServerSideEncryptionConfiguration(`${name}-${purpose}-encryption`, {
    bucket: bucket.id,
    rules: [
      {
        applyServerSideEncryptionByDefault: {
          sseAlgorithm: "AES256",
        },
      },
    ],
  })

  new aws.s3.BucketPublicAccessBlock(`${name}-${purpose}-public-access-block`, {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  })

  return bucket
}

function awsConfigServiceRoleArn(name: string, config: EnvironmentConfig): pulumi.Output<string> {
  if (config.name === "staging") {
    return new aws.iam.ServiceLinkedRole(`${name}-aws-config-service-linked-role`, {
      awsServiceName: "config.amazonaws.com",
      description: "Service-linked role for AWS Config compliance recording.",
    }).arn
  }

  return aws.iam.getRoleOutput({ name: "AWSServiceRoleForConfig" }).arn
}

function createAwsConfigRecorder(name: string, config: EnvironmentConfig): {
  recorder: aws.cfg.Recorder
  deliveryChannel: aws.cfg.DeliveryChannel
} {
  const bucket = createComplianceBucket(name, config, "aws-config")
  const callerIdentity = aws.getCallerIdentityOutput({})
  const serviceRoleArn = awsConfigServiceRoleArn(name, config)

  const bucketPolicy = new aws.s3.BucketPolicy(`${name}-aws-config-bucket-policy`, {
    bucket: bucket.id,
    policy: pulumi.all([bucket.arn, callerIdentity.accountId]).apply(([bucketArn, accountId]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AWSConfigBucketPermissionsCheck",
            Effect: "Allow",
            Principal: { Service: "config.amazonaws.com" },
            Action: ["s3:GetBucketAcl", "s3:ListBucket"],
            Resource: bucketArn,
            Condition: {
              StringEquals: {
                "AWS:SourceAccount": accountId,
              },
            },
          },
          {
            Sid: "AWSConfigBucketDelivery",
            Effect: "Allow",
            Principal: { Service: "config.amazonaws.com" },
            Action: "s3:PutObject",
            Resource: `${bucketArn}/AWSConfig/AWSLogs/${accountId}/Config/*`,
            Condition: {
              StringEquals: {
                "AWS:SourceAccount": accountId,
                "s3:x-amz-acl": "bucket-owner-full-control",
              },
            },
          },
        ],
      }),
    ),
  })

  const recorder = new aws.cfg.Recorder(
    `${name}-aws-config-recorder`,
    {
      name: "compai-config-recorder",
      roleArn: serviceRoleArn,
      recordingGroup: {
        allSupported: true,
        includeGlobalResourceTypes: true,
      },
      recordingMode: {
        recordingFrequency: "CONTINUOUS",
      },
    },
    {
      deleteBeforeReplace: true,
      dependsOn: [bucketPolicy],
    },
  )

  const deliveryChannel = new aws.cfg.DeliveryChannel(
    `${name}-aws-config-delivery-channel`,
    {
      name: "compai-delivery-channel",
      s3BucketName: bucket.bucket,
      s3KeyPrefix: "AWSConfig",
      snapshotDeliveryProperties: {
        deliveryFrequency: "TwentyFour_Hours",
      },
    },
    {
      deleteBeforeReplace: true,
      dependsOn: [recorder],
    },
  )

  new aws.cfg.RecorderStatus(
    `${name}-aws-config-recorder-status`,
    {
      name: recorder.name,
      isEnabled: true,
    },
    {
      deleteBeforeReplace: true,
      dependsOn: [deliveryChannel],
    },
  )

  return { recorder, deliveryChannel }
}

function createCloudTrailWithCloudWatch(name: string, config: EnvironmentConfig): {
  trail: aws.cloudtrail.Trail
  logGroup: aws.cloudwatch.LogGroup
} {
  const callerIdentity = aws.getCallerIdentityOutput({})
  const bucket = createComplianceBucket(name, config, "cloudtrail")
  const trailName = `${name}-management-events`

  const bucketPolicy = new aws.s3.BucketPolicy(`${name}-cloudtrail-bucket-policy`, {
    bucket: bucket.id,
    policy: pulumi.all([bucket.arn, callerIdentity.accountId]).apply(([bucketArn, accountId]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "AWSCloudTrailAclCheck",
            Effect: "Allow",
            Principal: { Service: "cloudtrail.amazonaws.com" },
            Action: "s3:GetBucketAcl",
            Resource: bucketArn,
            Condition: {
              StringEquals: {
                "aws:SourceArn": `arn:aws:cloudtrail:${config.region}:${accountId}:trail/${trailName}`,
              },
            },
          },
          {
            Sid: "AWSCloudTrailWrite",
            Effect: "Allow",
            Principal: { Service: "cloudtrail.amazonaws.com" },
            Action: "s3:PutObject",
            Resource: `${bucketArn}/AWSLogs/${accountId}/*`,
            Condition: {
              StringEquals: {
                "s3:x-amz-acl": "bucket-owner-full-control",
                "aws:SourceArn": `arn:aws:cloudtrail:${config.region}:${accountId}:trail/${trailName}`,
              },
            },
          },
        ],
      }),
    ),
  })

  const logGroup = new aws.cloudwatch.LogGroup(`${name}-cloudtrail-log-group`, {
    name: `/aws/cloudtrail/${name}`,
    retentionInDays: 365,
    tags: {
      Name: `/aws/cloudtrail/${name}`,
      Environment: config.name,
      Purpose: "cloudtrail-management-events",
    },
  })

  const role = new aws.iam.Role(`${name}-cloudtrail-cloudwatch-role`, {
    assumeRolePolicy: serviceAssumeRolePolicy("cloudtrail.amazonaws.com"),
    tags: {
      Name: `${name}-cloudtrail-cloudwatch-role`,
      Environment: config.name,
      Purpose: "cloudtrail-cloudwatch-logs-delivery",
    },
  })

  const rolePolicy = new aws.iam.RolePolicy(`${name}-cloudtrail-cloudwatch-policy`, {
    role: role.id,
    policy: pulumi.all([logGroup.arn]).apply(([logGroupArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["logs:CreateLogStream", "logs:PutLogEvents"],
            Resource: `${logGroupArn}:log-stream:*`,
          },
        ],
      }),
    ),
  })

  const trail = new aws.cloudtrail.Trail(
    `${name}-cloudtrail`,
    {
      name: trailName,
      s3BucketName: bucket.bucket,
      cloudWatchLogsGroupArn: pulumi.interpolate`${logGroup.arn}:*`,
      cloudWatchLogsRoleArn: role.arn,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      enableLogFileValidation: true,
      enableLogging: true,
      tags: {
        Name: trailName,
        Environment: config.name,
        Purpose: "management-event-audit-logging",
      },
    },
    {
      dependsOn: [bucketPolicy, rolePolicy],
    },
  )

  return { trail, logGroup }
}

function createGuardDutyServiceLinkedRole(name: string, config: EnvironmentConfig): aws.iam.ServiceLinkedRole | undefined {
  if (config.name !== "staging") return undefined

  return new aws.iam.ServiceLinkedRole(
    `${name}-guardduty-service-linked-role`,
    {
      awsServiceName: "guardduty.amazonaws.com",
      description: "A service-linked role required for Amazon GuardDuty to access your resources. ",
    },
    {
      protect: true,
    },
  )
}

export function createSecurityCompliance(name: string, config: EnvironmentConfig): SecurityComplianceOutput {
  const awsConfig = createAwsConfigRecorder(name, config)
  const cloudTrail = createCloudTrailWithCloudWatch(name, config)
  const guardDutyServiceLinkedRole = createGuardDutyServiceLinkedRole(name, config)
  const guardDutyDetector = new aws.guardduty.Detector(
    `${name}-guardduty-detector`,
    {
      enable: true,
      findingPublishingFrequency: "FIFTEEN_MINUTES",
      tags: {
        Name: `${name}-guardduty-detector`,
        Environment: config.name,
        Purpose: "threat-detection",
      },
    },
    {
      dependsOn: guardDutyServiceLinkedRole ? [guardDutyServiceLinkedRole] : [],
    },
  )

  return {
    configRecorder: awsConfig.recorder,
    configDeliveryChannel: awsConfig.deliveryChannel,
    cloudTrail: cloudTrail.trail,
    cloudTrailLogGroup: cloudTrail.logGroup,
    guardDutyDetector,
  }
}
