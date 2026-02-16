import { Readable } from 'stream'

import { Disk, errors } from 'flydrive'
import { FSDriver } from 'flydrive/drivers/fs'
import { SignedURLOptions, WriteOptions } from 'flydrive/types'

import { Result } from './Result'
import { createDiskDriver } from './disk/config'
import { getReadableStreamFromFile } from './disk/utils'

export class DiskWrapper {
  private disk: Disk

  constructor(visibility: 'private' | 'public' = 'private', disk?: Disk) {
    this.disk = disk ?? new Disk(this.buildDisk(visibility))
  }

  file(key: string) {
    return this.disk.file(key)
  }

  async getUrl(key: string) {
    return this.disk.getUrl(key)
  }

  async getSignedUrl(key: string, options?: SignedURLOptions) {
    if (this.disk.driver instanceof FSDriver) return this.disk.getUrl(key)

    return this.disk.getSignedUrl(key, options)
  }

  async putFile(key: string, file: File, options?: WriteOptions) {
    const contents = await getReadableStreamFromFile(file)
    return this.putStream(key, contents, options)
  }

  async deleteAll(prefix: string) {
    try {
      await this.disk.deleteAll(prefix)
      return Result.nil()
    } catch (e) {
      if (e instanceof errors.E_CANNOT_DELETE_FILE) {
        return Result.error(new Error('Cannot delete file'))
      }

      const error = e as Error
      return Result.error(error)
    }
  }

  async get(key: string) {
    return this.disk.get(key)
  }

  async getBuffer(key: string): Promise<Buffer> {
    const stream = await this.disk.getStream(key)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  async putBuffer(key: string, contents: Buffer, options?: WriteOptions) {
    try {
      const stream = Readable.from(contents)
      await this.disk.putStream(key, stream, {
        ...options,
        contentLength: contents.length,
      })
      return Result.nil()
    } catch (e) {
      return Result.error(e as Error)
    }
  }

  async put(key: string, contents: string, options?: WriteOptions) {
    try {
      const byteLength = Buffer.byteLength(contents, 'utf8')
      await this.disk.put(key, contents, {
        ...options,
        contentLength: byteLength,
      })

      return Result.nil()
    } catch (e) {
      return Result.error(e as Error)
    }
  }

  async getStream(key: string) {
    return this.disk.getStream(key)
  }

  async exists(key: string) {
    return this.disk.exists(key)
  }

  async putStream(key: string, contents: Readable, options?: WriteOptions) {
    try {
      // For streams, we'll only set contentLength if it's explicitly provided
      // or if the stream has a reliable readableLength
      const streamOptions = { ...options }
      if (
        contents.readableLength !== undefined &&
        contents.readableLength > 0
      ) {
        streamOptions.contentLength = contents.readableLength
      }

      await this.disk.putStream(key, contents, streamOptions)

      return Result.nil()
    } catch (e) {
      return Result.error(e as Error)
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

  private buildDisk(visibility: 'private' | 'public') {
    return createDiskDriver(visibility)
  }
}

export function diskFactory(visibility: 'private' | 'public' = 'private') {
  return new DiskWrapper(visibility)
}
