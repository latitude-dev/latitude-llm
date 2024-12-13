import * as aws from '@pulumi/aws'

const regionProvider = new aws.Provider('euCentral1RegionProvider', {
  region: 'eu-central-1',
})

export const bucket = new aws.s3.BucketV2(
  'mainLatitudeBucketResouce',
  {
    acl: 'private', // Canned ACL
    bucket: 'latitude-llm-bucket-production',
    tags: {
      Name: 'Latitude LLM bucket',
      Environment: 'Production',
    },
  },
  { provider: regionProvider },
)

export const bucketName = bucket.bucket

export const publicBucket = new aws.s3.BucketV2(
  'publicLatitudeBucketResource',
  {
    acl: 'private',
    bucket: 'latitude-llm-public-bucket-production',
    tags: {
      Name: 'Latitude LLM public bucket',
      Environment: 'Production',
    },
  },
  { provider: regionProvider },
)

new aws.s3.BucketPublicAccessBlock(
  'publicLatitudeBucketPublicAccess',
  {
    bucket: publicBucket.id,
    blockPublicAcls: false,
    blockPublicPolicy: false,
    ignorePublicAcls: false,
    restrictPublicBuckets: false,
  },
  { provider: regionProvider },
)

export const publicBucketName = publicBucket.bucket

new aws.s3.BucketPolicy(
  'publicLatitudeBucketPolicy',
  {
    bucket: publicBucket.id,
    policy: publicBucket.arn.apply((bucketArn) =>
      JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadGetObject',
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject', // Note: all actions are disallowed by default
            Resource: `${bucketArn}/*`,
          },
        ],
      }),
    ),
  },
  { provider: regionProvider },
)

new aws.s3.BucketCorsConfigurationV2(
  'publicLatitudeBucketCors',
  {
    bucket: publicBucket.id,
    corsRules: [
      {
        allowedHeaders: ['*'],
        allowedMethods: ['GET', 'HEAD'],
        allowedOrigins: ['https://latitude.so', 'https://*.latitude.so'],
        exposeHeaders: [
          'ETag',
          'Content-Type',
          'Content-Length',
          'Content-Range',
          'Content-Disposition',
          'Cache-Control',
          'Last-Modified',
          'Expires',
        ],
        maxAgeSeconds: 24 * 3600, // 24 hours
      },
    ],
  },
  { provider: regionProvider },
)
