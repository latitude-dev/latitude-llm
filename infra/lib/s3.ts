import * as aws from "@pulumi/aws"
import type { EnvironmentConfig } from "../config.ts"
import type { S3Bucket, S3BucketLifecycleConfigurationV2 } from "./types.ts"

export interface S3Output {
  bucket: S3Bucket
  lifecycleConfiguration: S3BucketLifecycleConfigurationV2
}

export function createS3(name: string, config: EnvironmentConfig): S3Output {
  const bucket = new aws.s3.Bucket(
    config.s3.bucketName,
    {
      tags: {
        Name: config.s3.bucketName,
        Environment: config.name,
      },
    },
    {
      protect: config.name === "production",
    },
  )

  new aws.s3.BucketVersioningV2(`${name}-versioning`, {
    bucket: bucket.id,
    versioningConfiguration: {
      status: config.s3.versioning ? "Enabled" : "Suspended",
    },
  })

  const lifecycleConfiguration = new aws.s3.BucketLifecycleConfigurationV2(`${name}-lifecycle`, {
    bucket: bucket.id,
    rules: [
      {
        id: "expire-old-objects",
        status: "Enabled",
        expiration: {
          days: config.s3.lifecycleDays,
        },
        noncurrentVersionExpiration: config.s3.versioning
          ? {
              noncurrentDays: 30,
            }
          : undefined,
      },
    ],
  })

  new aws.s3.BucketServerSideEncryptionConfigurationV2(`${name}-encryption`, {
    bucket: bucket.id,
    rules: [
      {
        applyServerSideEncryptionByDefault: {
          sseAlgorithm: "AES256",
        },
      },
    ],
  })

  new aws.s3.BucketPublicAccessBlock(`${name}-public-access-block`, {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  })

  return {
    bucket,
    lifecycleConfiguration,
  }
}
