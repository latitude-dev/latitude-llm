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
    acl: 'private', // Only allowing access through signed urls
    bucket: 'latitude-llm-public-bucket-production',
    tags: {
      Name: 'Latitude LLM public bucket',
      Environment: 'Production',
    },
  },
  { provider: regionProvider },
)

export const publicBucketName = publicBucket.bucket
