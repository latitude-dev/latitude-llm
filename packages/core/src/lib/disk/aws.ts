import { env } from '@latitude-data/env'

/**
 * These env variables are set in production.
 * If you want to test this locally, you need to set them in your machine.
 * Create a .env.development file in packages/env/.env.development and add the following:
 *
 * S3_BUCKET=[your-bucket-name]
 * PUBLIC_S3_BUCKET=[your-public-bucket-name]
 * AWS_REGION=[your-region]
 * AWS_ACCESS_KEY=[your-key]
 * AWS_ACCESS_SECRET=[your-secret]
 */
export function getAwsConfig() {
  const bucket = env.S3_BUCKET
  const publicBucket = env.PUBLIC_S3_BUCKET
  const region = env.AWS_REGION

  if (!bucket || !publicBucket || !region)
    throw new Error(
      `Missing required AWS configuration variables: ${[!bucket && 'S3_BUCKET', !publicBucket && 'PUBLIC_S3_BUCKET', !region && 'AWS_REGION'].filter(Boolean).join(', ')}.`,
    )

  const accessKeyId = env.AWS_ACCESS_KEY
  const secretAccessKey = env.AWS_ACCESS_SECRET

  if (accessKeyId && secretAccessKey) {
    return {
      region,
      bucket,
      publicBucket,
      credentials: { accessKeyId, secretAccessKey },
    }
  }

  // If AWS_ACCESS_KEY and AWS_ACCESS_SECRET are not set, the SDK will use AWS IAM role.
  return {
    region,
    bucket,
    publicBucket,
  }
}
