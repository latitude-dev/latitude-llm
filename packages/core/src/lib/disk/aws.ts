import { env } from '@latitude-data/env'

/**
 * These env variables are set in production.
 * If you want to test this locally, you need to set them in your machine.
 * Create a .env.development file in packages/env/.env.development and add the following:
 *
 * S3_BUCKET=[your-bucket-name]
 * AWS_REGION=[your-region]
 */
export function getAwsConfig() {
  const bucket = env.S3_BUCKET
  const region = env.AWS_REGION

  if (!bucket || !region) {
    throw new Error(
      `Missing required AWS configuration variables: ${[!bucket && 'S3_BUCKET', !region && 'AWS_REGION'].filter(Boolean).join(', ')}.`,
    )
  }

  return {
    region,
    bucket,
  }
}
