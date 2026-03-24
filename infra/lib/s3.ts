import * as aws from "@pulumi/aws"
import type { EnvironmentConfig } from "../config.ts"
import type { S3Bucket, S3BucketLifecycleConfiguration } from "./types.ts"

export interface S3Output {
  bucket: S3Bucket
  lifecycleConfiguration: S3BucketLifecycleConfiguration
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

  new aws.s3.BucketVersioning(
    `${name}-versioning`,
    {
      bucket: bucket.id,
      versioningConfiguration: {
        status: config.s3.versioning ? "Enabled" : "Suspended",
      },
    },
    {
      aliases: [{ type: "aws:s3/bucketVersioningV2:BucketVersioningV2" }],
    },
  )

  const lifecycleConfiguration = new aws.s3.BucketLifecycleConfiguration(
    `${name}-lifecycle`,
    {
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
    },
    {
      aliases: [{ type: "aws:s3/bucketLifecycleConfigurationV2:BucketLifecycleConfigurationV2" }],
    },
  )

  new aws.s3.BucketServerSideEncryptionConfiguration(
    `${name}-encryption`,
    {
      bucket: bucket.id,
      rules: [
        {
          applyServerSideEncryptionByDefault: {
            sseAlgorithm: "AES256",
          },
        },
      ],
    },
    {
      aliases: [{ type: "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2" }],
    },
  )

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
