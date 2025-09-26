import { env } from '@latitude-data/env'
import { FSDriver } from 'flydrive/drivers/fs'
import { S3Driver } from 'flydrive/drivers/s3'
import { GCSDriver } from 'flydrive/drivers/gcs'

import { getAwsConfig } from './aws'
import { getGcsConfig } from './gcs'
import { generateUrl } from './utils'

export function createDiskDriver(visibility: 'private' | 'public') {
  const key = env.DRIVE_DISK
  const baseUrl = env.APP_URL
  const publicPath = env.FILE_PUBLIC_PATH
  const location = env.FILES_STORAGE_PATH
  const publicLocation = env.PUBLIC_FILES_STORAGE_PATH

  if (key === 'gcs') {
    const gcsConfig = getGcsConfig()

    if (visibility === 'public') {
      return new GCSDriver({
        ...gcsConfig,
        bucket: gcsConfig.publicBucket,
        visibility: 'public',
        usingUniformAcl: true,
      })
    }

    return new GCSDriver({
      ...gcsConfig,
      bucket: gcsConfig.bucket,
      visibility: 'private',
      usingUniformAcl: true,
    })
  }

  if (key === 'local') {
    if (!location && !publicLocation) {
      throw new Error(
        'PUBLIC_FILES_STORAGE_PATH env variable is required when using local disk.',
      )
    }

    if (visibility === 'public') {
      return new FSDriver({
        location: publicLocation!,
        visibility: 'public',
        urlBuilder: { generateURL: generateUrl(baseUrl!, publicPath!) },
      })
    }

    return new FSDriver({
      location: location!,
      visibility: 'private',
      urlBuilder: { generateURL: generateUrl('', publicPath!) },
    })
  }

  // Default to S3
  const awsConfig = getAwsConfig()

  if (visibility === 'public') {
    return new S3Driver({
      credentials: awsConfig.credentials,
      region: awsConfig.region,
      bucket: awsConfig.publicBucket,
      supportsACL: false,
      visibility: 'public',
    })
  }

  return new S3Driver({
    credentials: awsConfig.credentials,
    region: awsConfig.region,
    bucket: awsConfig.bucket,
    supportsACL: false,
    visibility: 'private',
  })
}
