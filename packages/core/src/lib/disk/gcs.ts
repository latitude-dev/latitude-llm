import { env } from '@latitude-data/env'

/**
 * These env variables are set in production.
 * If you want to test this locally, you need to set them in your machine.
 * Create a .env.development file in packages/env/.env.development and add the following:
 *
 * GCS_BUCKET=[your-bucket-name]
 * GCS_PUBLIC_BUCKET=[your-public-bucket-name]
 * GCS_PROJECT_ID=[your-project-id]
 * GCS_KEY_FILENAME=[path-to-service-account-key.json]
 * GCS_CLIENT_EMAIL=[service-account-email]
 * GCS_PRIVATE_KEY=[service-account-private-key]
 */
export function getGcsConfig() {
  const bucket = env.GCS_BUCKET
  const publicBucket = env.GCS_PUBLIC_BUCKET
  const projectId = env.GCS_PROJECT_ID

  if (!bucket || !publicBucket || !projectId)
    throw new Error(
      `Missing required GCS configuration variables: ${[!bucket && 'GCS_BUCKET', !publicBucket && 'GCS_PUBLIC_BUCKET', !projectId && 'GCS_PROJECT_ID'].filter(Boolean).join(', ')}.`,
    )

  const keyFilename = env.GCS_KEY_FILENAME
  const clientEmail = env.GCS_CLIENT_EMAIL
  const privateKey = env.GCS_PRIVATE_KEY

  if (keyFilename) {
    return {
      projectId,
      bucket,
      publicBucket,
      keyFilename,
    }
  }

  if (clientEmail && privateKey) {
    return {
      projectId,
      bucket,
      publicBucket,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
    }
  }

  // If no specific credentials are provided, use default credentials
  return {
    projectId,
    bucket,
    publicBucket,
  }
}
