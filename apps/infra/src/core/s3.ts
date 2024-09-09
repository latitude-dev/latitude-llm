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
