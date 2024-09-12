import path from 'path'
import { Readable } from 'stream'
import { fileURLToPath } from 'url'

import { Result } from '@latitude-data/core/lib/Result'
import { env } from '@latitude-data/env'
import { Disk, errors } from 'flydrive'
import { FSDriver } from 'flydrive/drivers/fs'
import { S3Driver } from 'flydrive/drivers/s3'
import { WriteOptions } from 'flydrive/types'

const generateUrl = (publicPath: string) => async (key: string) =>
  `/${publicPath}/${key}`

/**
 * These env variables are set in production.
 * If you want to test this locally, you need to set them in your machine.
 * Create a .env.development file in packages/env/.env.development and add the following:
 *
 * S3_BUCKET=[your-bucket-name]
 * AWS_REGION=[your-region]
 * AWS_ACCESS_KEY=[your-key]
 * AWS_ACCESS_SECRET=[your-secret]
 */
function getAwsConfig() {
  const accessKeyId = env.AWS_ACCESS_KEY
  const bucket = env.S3_BUCKET
  const region = env.AWS_REGION
  const secretAccessKey = env.AWS_ACCESS_SECRET

  if (!accessKeyId || !secretAccessKey || !bucket || !region) {
    throw new Error(
      'AWS credentials not configured. Check you setup AWS_ACCESS_KEY, AWS_ACCESS_SECRET, S3_BUCKET and AWS_REGION in your .env file.',
    )
  }

  return { region, bucket, credentials: { accessKeyId, secretAccessKey } }
}

async function getReadableStreamFromFile(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const stream = new Readable()
  stream.push(buffer)
  stream.push(null)

  return stream
}

type BuildArgs = { local: { publicPath: string; location: string } }

export class DiskWrapper {
  private disk: Disk

  constructor(args: BuildArgs) {
    this.disk = new Disk(this.buildDisk(args))
  }

  file(key: string) {
    return this.disk.file(key)
  }

  async getUrl(key: string | undefined | null) {
    if (!key) return null

    return this.disk.getUrl(key)
  }

  async putFile(key: string, file: File) {
    const contents = await getReadableStreamFromFile(file)
    return this.putStream(key, contents)
  }

  async putStream(key: string, contents: Readable, options?: WriteOptions) {
    try {
      await this.disk.putStream(key, contents, {
        ...options,
        contentLength: contents.readableLength,
      })
      return Result.nil()
    } catch (e) {
      if (e instanceof errors.E_CANNOT_WRITE_FILE) {
        return Result.error(new Error('Cannot write file'))
      }

      const error = e as Error
      return Result.error(error)
    }
  }

  async delete(key: string | null | undefined) {
    if (!key) return Result.nil()

    try {
      await this.disk.delete(key)
      return Result.nil()
    } catch (e) {
      if (e instanceof errors.E_CANNOT_DELETE_FILE) {
        return Result.error(new Error('Cannot delete file'))
      }

      const error = e as Error
      return Result.error(error)
    }
  }

  private buildDisk({ local }: BuildArgs) {
    const key = env.DRIVE_DISK

    if (key === 'local' && process.env.NODE_ENV === 'production') {
      new Error('Local file system not allowed as file storage in production')
    }

    if (key === 'local') {
      return new FSDriver({
        location: local.location,
        visibility: 'private',
        urlBuilder: { generateURL: generateUrl(local.publicPath) },
      })
    }

    const awsConfig = getAwsConfig()

    return new S3Driver({
      // @ts-ignore
      credentials: awsConfig.credentials,
      region: awsConfig.region,
      bucket: awsConfig.bucket,
      supportsACL: false,
      visibility: 'private',
    })
  }
}

const PUBLIC_PATH = 'uploads'

export const diskFactory = () =>
  new DiskWrapper({
    local: {
      publicPath: PUBLIC_PATH,
      location: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        // TODO: This needs to come from env
        `../../public/${PUBLIC_PATH}`,
      ),
    },
  })
