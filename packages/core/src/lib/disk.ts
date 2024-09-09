import { Readable } from 'stream'

import { Result } from '@latitude-data/core/lib/Result'
import { env } from '@latitude-data/env'
import { Disk, errors } from 'flydrive'
import { FSDriver } from 'flydrive/drivers/fs'
import { S3Driver } from 'flydrive/drivers/s3'
import { WriteOptions } from 'flydrive/types'

const generateUrl = (publicPath: string) => async (key: string) =>
  `/${publicPath}/${key}`

function getAwsCredentials() {
  const accessKeyId = env.AWS_ACCESS_KEY
  const secretAccessKey = env.AWS_ACCESS_SECRET

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials not configured')
  }

  return { accessKeyId, secretAccessKey }
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
      await this.disk.putStream(key, contents, options)
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

    return new S3Driver({
      credentials: getAwsCredentials(),
      region: env.AWS_REGION,
      bucket: env.S3_BUCKET,
      visibility: 'private',
    })
  }
}
